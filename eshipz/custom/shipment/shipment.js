// Copyright (c) 2024, Frutter Software Labs Private Limited and contributors
// For license information, please see license.txt

frappe.ui.form.on('Shipment', {
	refresh: function (frm) {
		// Check if enabled in eShipz Settings
		frappe.call({
			method: 'frappe.client.get_value',
			args: {
				doctype: 'eShipz Settings',
				fieldname: 'enabled'
			},
			callback: function (r) {
				if (r.message && r.message.enabled == 1) {

					// ==========================================
					// 1-CLICK CREATE & PRINT LABEL BUTTON
					// ==========================================
					if (frm.doc.docstatus == 1 && !frm.doc.awb_number) {
						frm.add_custom_button(__('Create Shipment & Print Label'), function () {

							// Step 1: Silently fetch available services
							frappe.call({
								method: 'eshipz.custom.shipment.shipment.fetch_available_services',
								args: { docname: frm.docname },
								freeze: true,
								freeze_message: __('Finding Bluedart Service... ⏳☕'),
								callback: function (r) {
									if (r.message && r.message.length > 0) {

										let bluedart_service = null;
										let selected_tech = null;

										// Step 2: Look for Bluedart in the response
										for (let s of r.message) {
											if (s.slug && s.slug.toLowerCase().includes('bluedart')) {
												bluedart_service = s;
												if (s.technicality && s.technicality.length > 0) {
													selected_tech = s.technicality[0].service_type;
												}
												break;
											}
										}

										if (!bluedart_service) {
											frappe.msgprint({ title: __('Error'), indicator: 'red', message: __('Bluedart is not available for this specific route.') });
											return;
										}

										// Step 3: Format it exactly like the popup used to
										bluedart_service.selected_service_type = selected_tech;

										// Step 4: Call the STANDARD create_shipment API
										frappe.call({
											method: 'eshipz.custom.shipment.shipment.create_shipment',
											args: {
												docname: frm.docname,
												selected_service: JSON.stringify(bluedart_service),
												item_data: "" // Sending empty string forces auto-packing
											},
											freeze: true,
											freeze_message: __('Creating Shipment with eShipz... ⏳☕'),
											callback: function (res) {
												if (res.message && res.message.label_url) {
													frappe.show_alert({ message: __('Shipment Created! Opening Label...'), indicator: 'green' });
													window.open(res.message.label_url, '_blank');
													frm.reload_doc();
												} else {
													frappe.msgprint({
														title: __('Error'),
														indicator: 'red',
														message: __('Failed to retrieve the Label URL from the API.')
													});
												}
											}
										});

									} else {
										frappe.msgprint({ title: __('Error'), indicator: 'red', message: __('No courier services returned from eShipz.') });
									}
								}
							});
						}).addClass('btn-info').css({ 'background': '#239b56', 'color': 'white' });
					}

					// ==========================================
					// POST-CREATION MANAGEMENT BUTTONS
					// ==========================================
					if (frm.doc.docstatus == 1 && frm.doc.awb_number && frm.doc.status != 'Cancelled') {

						frm.add_custom_button(__('Download/Print Label'), function () {
							window.open(frm.doc.tracking_url, '_blank');
						}).addClass('btn-primary').css({ 'background': '#21618c', 'color': 'white' });

						frm.add_custom_button(__('Cancel Shipment'), function () {
							frappe.call({
								method: 'eshipz.custom.shipment.shipment.cancel_shipment',
								args: { docname: frm.docname },
								freeze: true,
								freeze_message: __('Cancelling Shipment... Please wait...⏳☕'),
								callback: function (res) {
									if (res.message) {
										frappe.msgprint(__('Shipment Cancelled'));
										frm.reload_doc();
									}
								}
							});
						}).addClass('btn-danger');

						frm.add_custom_button(__('Track Shipment'), function () {
							var awb_number = frm.doc.awb_number;
							var service_provider = frm.doc.service_provider;
							var track_url = `https://track.eshipz.com/track?awb=${awb_number}&slug=${service_provider}`;
							window.open(track_url, '_blank');
						}).addClass('btn-primary').css({ 'background': '#196f3d', 'color': 'white' });

						frm.add_custom_button(__('Update Status'), function () {
							frappe.call({
								method: 'eshipz.custom.shipment.shipment.update_status',
								args: { docname: frm.docname },
								freeze: true,
								freeze_message: __('Getting Status... Please wait...⏳☕'),
								callback: function (res) {
									if (res.message) {
										frappe.msgprint(__('Status Updated'));
										frm.reload_doc();
									}
								}
							});
						}).addClass('btn-info').css({ 'background': '#239b56', 'color': 'white' });
					}
				}
			}
		});
	}
});