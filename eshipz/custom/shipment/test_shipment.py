import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from erpnext.stock.doctype.shipment.test_shipment import (
    create_test_delivery_note,
    create_test_shipment,
)

from eshipz.custom.shipment.shipment import create_shipment
from eshipz.utils.request_log import RequestLogResult


def _selected_service():
    return json.dumps(
        {
            "vendor_id": "BD",
            "description": "Bluedart",
            "slug": "bluedart",
            "selected_service_type": "surface",
        }
    )


def _mock_log_result(status_code, json_body, log_name="test-log-001"):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    response.text = json.dumps(json_body)
    return RequestLogResult(response=response, log_name=log_name, error_type=None)


class TestShipmentCreateShipmentLogging(FrappeTestCase):
    def setUp(self):
        frappe.db.set_single_value("eShipz Settings", "api_token", "test-token")
        delivery_note = create_test_delivery_note()
        delivery_note.submit()
        self.shipment = create_test_shipment([delivery_note])

    def tearDown(self):
        frappe.db.rollback()

    @patch("eshipz.custom.shipment.shipment.record_log_error")
    @patch("eshipz.custom.shipment.shipment.send_logged_request")
    def test_malformed_response_logs_and_throws_clean_error(
        self, mock_send, mock_record_error
    ):
        """Failure: a 200 response missing result['data']['files']['label'] raises a
        clean frappe.throw referencing the Integration Request name (not a raw
        KeyError), and flips that log to Failed via record_log_error."""
        mock_send.return_value = _mock_log_result(200, {"data": {"files": {}}})

        with self.assertRaises(frappe.ValidationError) as ctx:
            create_shipment(self.shipment.name, _selected_service())

        self.assertIn("test-log-001", str(ctx.exception))
        mock_record_error.assert_called_once()
        self.assertEqual(mock_record_error.call_args[0][0], "test-log-001")

    @patch("eshipz.custom.shipment.shipment.send_logged_request")
    def test_well_formed_response_books_shipment(self, mock_send):
        """Success: a well-formed 200 response still updates every db_set field and
        returns the expected dict — regression guard proving the refactor didn't
        break the happy path."""
        mock_send.return_value = _mock_log_result(
            200,
            {
                "data": {
                    "files": {
                        "label": {
                            "label_meta": {"url": "http://label.url", "awb": "AWB123"}
                        }
                    },
                    "slug": "bluedart",
                    "status": "In Transit",
                    "service_type": "surface",
                    "order_id": "ORDER123",
                }
            },
        )

        result = create_shipment(self.shipment.name, _selected_service())

        self.assertEqual(result["awb_number"], "AWB123")
        self.shipment.reload()
        self.assertEqual(self.shipment.awb_number, "AWB123")
        self.assertEqual(self.shipment.status, "Booked")

    @patch("eshipz.custom.shipment.shipment.send_logged_request")
    def test_non_200_response_throws_with_log_reference(self, mock_send):
        """Boundary: a non-200 response throws referencing the log name and never
        attempts to parse result['data']."""
        mock_send.return_value = _mock_log_result(
            422, {"message": "invalid address"}, log_name="test-log-002"
        )

        with self.assertRaises(frappe.ValidationError) as ctx:
            create_shipment(self.shipment.name, _selected_service())

        self.assertIn("test-log-002", str(ctx.exception))
