{
    'name': 'Sales Canvas',
    'version': '19.0.1.1.0',
    'category': 'Sales/Sales',
    'summary': 'Customer 360° card, credit limit, visit scheduling & approval workflow for field sales teams',
    'description': """
Sales Canvas
============
A dedicated sales command centre for your field team.

Customer 360° View
------------------
Separate "Sales Canvas" menu showing each customer's NPWP, Is PKP flag,
credit limit, salesman, and real-time stat buttons (Sales Orders, Invoiced,
Unpaid, Overdue, Credit remaining) — without touching the standard Contact form.

Inline Sales & Invoice Tables
------------------------------
Colour-coded inline tables for Sales Orders and Invoices directly on the
customer card. Invoice list also shows an Aged AR (days overdue) column.

Salesman Activity & Visit Map
------------------------------
Full visit planning (sc.visit model): create planned visits, check in with
a photo, check out, and view the day's route on an interactive Mapbox map.

Visit Approval Workflow
------------------------
4-stage approval: Planned → Upload Photo → Awaiting Manager Approval →
Approved → Completed. Dedicated Manager Approval menu for pending visits.

Role-Based Access
-----------------
Separate security groups for Salesman (field entry) and Sales Manager
(approval, full read). Standard Odoo Users & Groups assignment.
    """,
    'author': 'bornneo',
    'website': '',
    'license': 'LGPL-3',
    'price': 49.0,
    'currency': 'USD',
    'depends': [
        'contacts',
        'sale_management',
        'account',
    ],
    'data': [
        'security/sc_groups.xml',
        'security/ir.model.access.csv',
        'views/sc_visit_approval_views.xml',
        'views/sc_visit_views.xml',
        'views/res_partner_views.xml',
        'views/account_move_views.xml',
        'views/menu.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'sales_canvas/static/src/js/list_renderer_patch.js',
            'sales_canvas/static/src/js/sc_visit_map_action.js',
        ],
    },
    'images': ['static/description/banner.png'],
    'installable': True,
    'application': True,
    'auto_install': False,
}
