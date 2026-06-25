from odoo import models, fields, api


class AccountMove(models.Model):
    _inherit = 'account.move'

    sc_aged_ar_days = fields.Integer(
        string='Aged AR (Days)',
        compute='_compute_sc_aged_ar_days',
        store=False,
        help='Jumlah hari keterlambatan pembayaran.\n'
             'Jika belum jatuh tempo atau sudah dibayar: 0.\n'
             'Rumus: current_date - due_date (jika unpaid & overdue).',
    )

    @api.depends('invoice_date_due', 'payment_state', 'state', 'move_type')
    def _compute_sc_aged_ar_days(self):
        today = fields.Date.context_today(self)
        for move in self:
            if (
                move.move_type in ('out_invoice', 'in_invoice')
                and move.state == 'posted'
                and move.payment_state not in ('paid', 'in_payment', 'reversed')
                and move.invoice_date_due
                and move.invoice_date_due < today
            ):
                move.sc_aged_ar_days = (today - move.invoice_date_due).days
            else:
                move.sc_aged_ar_days = 0
