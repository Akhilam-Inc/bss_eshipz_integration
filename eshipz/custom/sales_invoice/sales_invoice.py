
import frappe
from frappe.model.document import Document


@frappe.whitelist()
def update_delivery_note(doc: Document, method: str | None = None):
    # Group SI items by delivery note to avoid N+1 saves
    dn_item_codes: dict[str, set] = {}
    for item in doc.items:
        if item.delivery_note:
            dn_item_codes.setdefault(item.delivery_note, set()).add(item.item_code)

    for dn_name, item_codes in dn_item_codes.items():
        delivery_note = frappe.get_doc("Delivery Note", dn_name)
        for dn_item in delivery_note.items:
            if dn_item.item_code in item_codes:
                dn_item.against_sales_invoice = doc.name
        delivery_note.save()
