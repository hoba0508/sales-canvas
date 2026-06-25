from odoo import models, fields, api, exceptions
from datetime import timedelta


class ScVisit(models.Model):
    _name = 'sc.visit'
    _description = 'Sales Canvas - Rencana Kunjungan Salesman'
    _order = 'visit_date asc, id asc'

    # -------------------------------------------------------------------------
    # Fields
    # -------------------------------------------------------------------------
    salesman_id = fields.Many2one(
        comodel_name='res.partner',
        string='Salesman',
        required=True,
        ondelete='cascade',
        domain="['|', ('category_id.name', '=', 'Sales'), ('function', '=', 'Sales')]",
    )
    customer_id = fields.Many2one(
        comodel_name='res.partner',
        string='Lokasi / Customer',
        required=True,
        domain=[('customer_rank', '>', 0)],
    )
    visit_date = fields.Date(
        string='Tanggal Rencana',
        required=True,
        default=fields.Date.context_today,
    )

    # ── Check-in ──────────────────────────────────────────────────────────────
    checkin_date = fields.Datetime(
        string='Waktu Check-in',
        readonly=True,
        copy=False,
        help='Diisi otomatis saat salesman klik "Check-in / Tandai Dikunjungi".',
    )

    # ── Check-out ─────────────────────────────────────────────────────────────
    checkout_date = fields.Datetime(
        string='Waktu Check-out',
        readonly=True,
        copy=False,
        help='Diisi otomatis saat salesman klik "Check-out / Selesai Dikunjungi".',
    )

    # Durasi kunjungan (computed dari checkin → checkout)
    visit_duration = fields.Char(
        string='Durasi Kunjungan',
        compute='_compute_visit_duration',
        store=False,
    )

    # ── Approval ──────────────────────────────────────────────────────────────
    visited_date = fields.Datetime(
        string='Waktu Check-in',          # alias lama, tetap disimpan
        readonly=True,
        copy=False,
        related='checkin_date',
        store=False,
    )
    approved_date = fields.Datetime(
        string='Waktu Diapprove',
        readonly=True,
        copy=False,
    )
    approved_by = fields.Many2one(
        comodel_name='res.users',
        string='Diapprove Oleh',
        readonly=True,
        copy=False,
    )
    done_date = fields.Datetime(
        string='Waktu Check-out',         # alias lama
        readonly=True,
        copy=False,
        related='checkout_date',
        store=False,
    )
    state = fields.Selection(
        selection=[
            ('planned',          'Direncanakan'),
            ('waiting_approval', 'Menunggu Approval'),
            ('visited',          'Sudah Dikunjungi'),
            ('done',             'Selesai Dikunjungi'),
            ('cancelled',        'Dibatalkan'),
        ],
        string='Status',
        default='planned',
        required=True,
        copy=False,
    )
    note = fields.Text(string='Catatan')
    visit_photo = fields.Binary(
        string='Foto Check-in',
        attachment=True,
        copy=False,
    )
    photo_filename = fields.Char(string='Nama File Foto', copy=False)
    rejection_reason = fields.Text(
        string='Alasan Penolakan',
        readonly=True,
        copy=False,
    )
    company_id = fields.Many2one(
        comodel_name='res.company',
        string='Company',
        default=lambda self: self.env.company,
    )

    # -------------------------------------------------------------------------
    # Compute
    # -------------------------------------------------------------------------
    @api.depends('checkin_date', 'checkout_date')
    def _compute_visit_duration(self):
        for rec in self:
            if rec.checkin_date and rec.checkout_date:
                delta = rec.checkout_date - rec.checkin_date
                total_minutes = int(delta.total_seconds() // 60)
                hours, minutes = divmod(total_minutes, 60)
                if hours:
                    rec.visit_duration = f'{hours} jam {minutes} menit'
                else:
                    rec.visit_duration = f'{minutes} menit'
            elif rec.checkin_date and not rec.checkout_date:
                rec.visit_duration = 'Sedang berlangsung...'
            else:
                rec.visit_duration = '-'

    # -------------------------------------------------------------------------
    # Action Methods
    # -------------------------------------------------------------------------
    def action_open_photo_wizard(self):
        """Check-in: buka wizard upload foto."""
        self.ensure_one()
        if self.state != 'planned':
            raise exceptions.UserError(
                'Hanya kunjungan dengan status Direncanakan yang dapat di-check-in.'
            )
        return {
            'type': 'ir.actions.act_window',
            'name': 'Check-in — Upload Foto Kunjungan',
            'res_model': 'sc.visit.photo.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_visit_id': self.id,
                'default_note': self.note or '',
            },
        }

    def action_approve(self):
        """Manager approve → status visited (salesman bisa check-out)."""
        for rec in self:
            if rec.state != 'waiting_approval':
                continue
            rec.write({
                'state': 'visited',
                'approved_date': fields.Datetime.now(),
                'approved_by': self.env.uid,
                'rejection_reason': False,
            })

    def action_reject(self):
        """Manager tolak → buka wizard alasan."""
        self.ensure_one()
        if self.state != 'waiting_approval':
            raise exceptions.UserError(
                'Hanya kunjungan Menunggu Approval yang dapat ditolak.'
            )
        return {
            'type': 'ir.actions.act_window',
            'name': 'Alasan Penolakan',
            'res_model': 'sc.visit.reject.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {'default_visit_id': self.id},
        }

    def action_mark_done(self):
        """Check-out: salesman selesai kunjungan → status done."""
        for rec in self:
            if rec.state != 'visited':
                continue
            rec.write({
                'state': 'done',
                'checkout_date': fields.Datetime.now(),
            })

    def action_cancel(self):
        self.write({'state': 'cancelled'})

    def action_reset_planned(self):
        self.write({
            'state': 'planned',
            'checkin_date': False,
            'checkout_date': False,
            'approved_date': False,
            'approved_by': False,
            'rejection_reason': False,
        })
