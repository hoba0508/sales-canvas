from odoo import models, fields, api


class ResPartner(models.Model):
    _inherit = 'res.partner'

    # -------------------------------------------------------------------------
    # Custom Fields
    # -------------------------------------------------------------------------

    sc_is_pkp = fields.Boolean(
        string='Is PKP',
        help='Pengusaha Kena Pajak',
        default=False,
    )
    sc_credit_limit = fields.Monetary(
        string='Credit Limit',
        currency_field='currency_id',
        default=0.0,
    )
    sc_salesman_id = fields.Many2one(
        comodel_name='res.users',
        string='Salesman',
        help='Salesman yang bertanggung jawab atas customer ini',
    )

    # -------------------------------------------------------------------------
    # One2many — Sales Orders
    # -------------------------------------------------------------------------
    sc_sale_order_ids = fields.One2many(
        comodel_name='sale.order',
        inverse_name='partner_id',
        string='Sales Orders',
    )

    # -------------------------------------------------------------------------
    # One2many — Invoices (Customer Invoice)
    # -------------------------------------------------------------------------
    sc_invoice_ids = fields.One2many(
        comodel_name='account.move',
        inverse_name='partner_id',
        string='Invoices',
        domain=[('move_type', '=', 'out_invoice')],
    )

    # -------------------------------------------------------------------------
    # One2many — Rencana Kunjungan (saat partner ini berperan sebagai Salesman)
    # -------------------------------------------------------------------------
    sc_visit_ids = fields.One2many(
        comodel_name='sc.visit',
        inverse_name='salesman_id',
        string='Rencana Kunjungan',
    )

    # -------------------------------------------------------------------------
    # Computed — Stat Buttons
    # -------------------------------------------------------------------------
    sc_sale_order_count = fields.Integer(
        string='Sales Order Count',
        compute='_compute_sc_sale_stats',
        store=False,
    )
    sc_sale_order_amount = fields.Monetary(
        string='Sales Order Amount',
        currency_field='currency_id',
        compute='_compute_sc_sale_stats',
        store=False,
    )
    sc_invoiced_amount = fields.Monetary(
        string='Invoiced Amount',
        currency_field='currency_id',
        compute='_compute_sc_invoice_stats',
        store=False,
    )
    sc_due_amount = fields.Monetary(
        string='Due Amount',
        currency_field='currency_id',
        compute='_compute_sc_invoice_stats',
        store=False,
    )
    sc_invoice_count = fields.Integer(
        string='Invoice Count',
        compute='_compute_sc_invoice_stats',
        store=False,
    )
    sc_due_count = fields.Integer(
        string='Due Count',
        compute='_compute_sc_invoice_stats',
        store=False,
    )
    sc_overdue_count = fields.Integer(
        string='Overdue Count',
        compute='_compute_sc_invoice_stats',
        store=False,
    )
    sc_overdue_amount = fields.Monetary(
        string='Overdue Amount',
        currency_field='currency_id',
        compute='_compute_sc_invoice_stats',
        store=False,
        help='Total sisa tagihan yang sudah melewati due date',
    )
    sc_max_aged_ar_days = fields.Integer(
        string='Max Aged AR (Days)',
        compute='_compute_sc_invoice_stats',
        store=False,
        help='Jumlah hari terlama dari invoice yang overdue',
    )
    sc_credit_remaining = fields.Monetary(
        string='Sisa Credit',
        currency_field='currency_id',
        compute='_compute_sc_credit_remaining',
        store=False,
        help='Sisa credit = Credit Limit - total invoice belum lunas',
    )
    sc_credit_exceeded = fields.Boolean(
        string='Credit Terlampaui',
        compute='_compute_sc_credit_remaining',
        store=False,
    )

    # -------------------------------------------------------------------------
    # Computed — Salesman Activity (Visit & Sales sebagai Salesperson)
    # -------------------------------------------------------------------------
    sc_visit_planned_count = fields.Integer(
        string='Rencana Visit',
        compute='_compute_sc_visit_stats',
        store=False,
        help='Jumlah total kunjungan yang direncanakan (tidak termasuk yang dibatalkan).',
    )
    sc_visit_done_count = fields.Integer(
        string='Dikunjungi',
        compute='_compute_sc_visit_stats',
        store=False,
        help='Jumlah kunjungan yang sudah selesai dilakukan.',
    )
    sc_visit_achievement = fields.Float(
        string='Achievement',
        compute='_compute_sc_visit_stats',
        store=False,
        help='Dikunjungi ÷ Rencana Visit. Disimpan sebagai pecahan (0.6 = 60%), '
             'ditampilkan dengan widget percentage.',
    )
    sc_last_visit_location = fields.Char(
        string='Lokasi Terakhir',
        compute='_compute_sc_visit_stats',
        store=False,
        help='Nama customer dari kunjungan terakhir yang sudah selesai.',
    )
    sc_next_visit_location = fields.Char(
        string='Lokasi Selanjutnya',
        compute='_compute_sc_visit_stats',
        store=False,
        help='Nama customer dari kunjungan terdekat yang masih direncanakan.',
    )
    sc_sm_sale_order_amount = fields.Monetary(
        string='Total Sales Order (Customer Kunjungan)',
        currency_field='currency_id',
        compute='_compute_sc_salesman_sales_stats',
        store=False,
        help='Total Sales Order dari seluruh customer yang ada di daftar '
             'Rencana Kunjungan salesman ini (status tidak dibatalkan), '
             'bukan berdasarkan siapa Salesperson di SO tersebut.',
    )
    sc_sm_invoiced_amount = fields.Monetary(
        string='Total Invoiced (Customer Kunjungan)',
        currency_field='currency_id',
        compute='_compute_sc_salesman_sales_stats',
        store=False,
        help='Total Invoice (posted) dari seluruh customer yang ada di daftar '
             'Rencana Kunjungan salesman ini (status tidak dibatalkan), '
             'bukan berdasarkan siapa Salesperson di invoice tersebut.',
    )

    # -------------------------------------------------------------------------
    # Compute Methods
    # -------------------------------------------------------------------------

    @api.depends('sc_credit_limit', 'sc_invoice_ids.amount_residual',
                 'sc_invoice_ids.payment_state', 'sc_invoice_ids.state')
    def _compute_sc_credit_remaining(self):
        for partner in self:
            invoices = partner.sc_invoice_ids.filtered(
                lambda i: i.move_type == 'out_invoice'
                and i.state == 'posted'
                and i.payment_state not in ('paid', 'in_payment', 'reversed')
                and i.amount_residual > 0
            )
            used = sum(invoices.mapped('amount_residual'))
            remaining = (partner.sc_credit_limit or 0.0) - used
            partner.sc_credit_remaining = remaining
            partner.sc_credit_exceeded = remaining < 0

    @api.depends('sc_sale_order_ids.amount_total', 'sc_sale_order_ids.state')
    def _compute_sc_sale_stats(self):
        for partner in self:
            orders = partner.sc_sale_order_ids.filtered(
                lambda o: o.state not in ('cancel', 'draft')
            )
            partner.sc_sale_order_count = len(orders)
            partner.sc_sale_order_amount = sum(orders.mapped('amount_total'))

    @api.depends(
        'sc_invoice_ids.amount_total',
        'sc_invoice_ids.amount_residual',
        'sc_invoice_ids.invoice_date_due',
        'sc_invoice_ids.payment_state',
        'sc_invoice_ids.state',
    )
    def _compute_sc_invoice_stats(self):
        today = fields.Date.context_today(self)
        for partner in self:
            invoices = partner.sc_invoice_ids.filtered(
                lambda i: i.move_type == 'out_invoice' and i.state == 'posted'
            )
            partner.sc_invoice_count = len(invoices)
            partner.sc_invoiced_amount = sum(invoices.mapped('amount_total'))

            due = invoices.filtered(
                lambda i: i.payment_state not in ('paid', 'in_payment', 'reversed')
                and i.amount_residual > 0
            )
            partner.sc_due_count = len(due)
            partner.sc_due_amount = sum(due.mapped('amount_residual'))

            overdue = due.filtered(
                lambda i: i.invoice_date_due and i.invoice_date_due < today
            )
            partner.sc_overdue_count = len(overdue)
            partner.sc_overdue_amount = sum(overdue.mapped('amount_residual'))
            if overdue:
                aged_days = [
                    (today - i.invoice_date_due).days
                    for i in overdue if i.invoice_date_due
                ]
                partner.sc_max_aged_ar_days = max(aged_days) if aged_days else 0
            else:
                partner.sc_max_aged_ar_days = 0

    @api.depends(
        'sc_visit_ids.state',
        'sc_visit_ids.visit_date',
        'sc_visit_ids.visited_date',
        'sc_visit_ids.done_date',
        'sc_visit_ids.customer_id',
    )
    def _compute_sc_visit_stats(self):
        for partner in self:
            # Rencana Visit = semua kunjungan yang tidak dibatalkan
            visits = partner.sc_visit_ids.filtered(lambda v: v.state != 'cancelled')

            # Dikunjungi = approved (visited) ATAU sudah selesai (done)
            done = visits.filtered(lambda v: v.state in ('visited', 'done'))

            partner.sc_visit_planned_count = len(visits)
            partner.sc_visit_done_count = len(done)
            partner.sc_visit_achievement = (len(done) / len(visits)) if visits else 0.0

            # Lokasi Terakhir: kunjungan 'visited'/'done' paling baru
            done_sorted = done.sorted(
                key=lambda v: v.done_date or v.visited_date or v.create_date,
                reverse=True,
            )
            partner.sc_last_visit_location = (
                done_sorted[0].customer_id.name if done_sorted else ''
            )

            # Lokasi Selanjutnya: kunjungan 'planned' dengan tanggal rencana paling dekat
            upcoming_sorted = visits.filtered(
                lambda v: v.state == 'planned'
            ).sorted(key=lambda v: v.visit_date)
            partner.sc_next_visit_location = (
                upcoming_sorted[0].customer_id.name if upcoming_sorted else ''
            )

    @api.depends('sc_visit_ids.customer_id', 'sc_visit_ids.state')
    def _compute_sc_salesman_sales_stats(self):
        SaleOrder = self.env['sale.order']
        AccountMove = self.env['account.move']
        for partner in self:
            # Customer kunjungan = seluruh customer di Rencana Kunjungan
            # yang tidak berstatus 'cancelled'. .mapped() otomatis
            # menghilangkan duplikat customer yang sama.
            visits = partner.sc_visit_ids.filtered(lambda v: v.state != 'cancelled')
            customers = visits.mapped('customer_id')

            if not customers:
                partner.sc_sm_sale_order_amount = 0.0
                partner.sc_sm_invoiced_amount = 0.0
                continue

            orders = SaleOrder.search([
                ('partner_id', 'in', customers.ids),
                ('state', 'not in', ('draft', 'cancel')),
            ])
            partner.sc_sm_sale_order_amount = sum(orders.mapped('amount_total'))

            invoices = AccountMove.search([
                ('partner_id', 'in', customers.ids),
                ('move_type', '=', 'out_invoice'),
                ('state', '=', 'posted'),
            ])
            partner.sc_sm_invoiced_amount = sum(invoices.mapped('amount_total'))

    # -------------------------------------------------------------------------
    # Action Methods
    # -------------------------------------------------------------------------
    def sc_action_view_sale_orders(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Sales Orders',
            'res_model': 'sale.order',
            'view_mode': 'list,form',
            'domain': [
                ('partner_id', 'child_of', self.id),
                ('state', 'not in', ['cancel', 'draft']),
            ],
            'context': {'default_partner_id': self.id},
        }

    def sc_action_view_invoices(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': 'Invoices',
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [
                ('partner_id', 'child_of', self.id),
                ('move_type', '=', 'out_invoice'),
                ('state', '!=', 'cancel'),
            ],
            'context': {
                'default_partner_id': self.id,
                'default_move_type': 'out_invoice',
            },
        }

    def sc_action_view_salesman_sale_orders(self):
        """Buka daftar Sales Order dari seluruh customer yang ada di
        Rencana Kunjungan salesman ini (dipakai oleh tombol
        'Total Sales Order' di form Salesman Activity)."""
        self.ensure_one()
        customers = self.sc_visit_ids.filtered(
            lambda v: v.state != 'cancelled'
        ).mapped('customer_id')
        return {
            'type': 'ir.actions.act_window',
            'name': 'Sales Order (Customer Kunjungan)',
            'res_model': 'sale.order',
            'view_mode': 'list,form',
            'domain': [
                ('partner_id', 'in', customers.ids),
                ('state', 'not in', ('draft', 'cancel')),
            ],
            'context': {'create': False},
        }

    def sc_action_view_salesman_invoices(self):
        """Buka daftar Invoice dari seluruh customer yang ada di
        Rencana Kunjungan salesman ini (dipakai oleh tombol
        'Total Invoiced' di form Salesman Activity)."""
        self.ensure_one()
        customers = self.sc_visit_ids.filtered(
            lambda v: v.state != 'cancelled'
        ).mapped('customer_id')
        return {
            'type': 'ir.actions.act_window',
            'name': 'Invoice (Customer Kunjungan)',
            'res_model': 'account.move',
            'view_mode': 'list,form',
            'domain': [
                ('partner_id', 'in', customers.ids),
                ('move_type', '=', 'out_invoice'),
                ('state', '=', 'posted'),
            ],
            'context': {'create': False},
        }

    def sc_action_view_visit_map(self):
        """Buka peta rute kunjungan interaktif dengan Mapbox Directions.
        Menampilkan pin bernomor dan garis rute antar customer kunjungan
        sesuai urutan tanggal rencana."""
        self.ensure_one()
        visits = self.sc_visit_ids.filtered(
            lambda v: v.state != 'cancelled'
        ).sorted(key=lambda v: (v.visit_date, v.id))

        waypoints = []
        for v in visits:
            p = v.customer_id
            lat = p.partner_latitude or 0.0
            lng = p.partner_longitude or 0.0
            if lat == 0.0 and lng == 0.0:
                continue
            waypoints.append({
                'id': p.id,
                'name': p.name,
                'lat': lat,
                'lng': lng,
                'visit_date': str(v.visit_date),
                'state': v.state,
                'note': v.note or '',
            })

        return {
            'type': 'ir.actions.client',
            'tag': 'sc_visit_map',
            'name': 'Peta Rencana Kunjungan \u2014 %s' % self.name,
            'params': {
                'salesman_name': self.name,
                'waypoints': waypoints,
            },
        }
