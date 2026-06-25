from odoo import models, fields, api, exceptions


class ScVisitPhotoWizard(models.TransientModel):
    _name = 'sc.visit.photo.wizard'
    _description = 'Wizard Check-in Kunjungan'

    visit_id = fields.Many2one(
        comodel_name='sc.visit',
        string='Kunjungan',
        required=True,
        readonly=True,
    )
    visit_photo = fields.Binary(
        string='Foto Check-in',
        required=True,
        help='Ambil atau upload foto toko sebagai bukti check-in.',
    )
    photo_filename = fields.Char(string='Nama File')
    note = fields.Text(string='Catatan Kunjungan')

    def action_confirm(self):
        """Check-in dikonfirmasi → catat checkin_date, status waiting_approval."""
        self.ensure_one()
        if not self.visit_photo:
            raise exceptions.UserError('Foto check-in wajib diisi.')
        self.visit_id.write({
            'state':          'waiting_approval',
            'checkin_date':   fields.Datetime.now(),
            'visit_photo':    self.visit_photo,
            'photo_filename': self.photo_filename,
            'note':           self.note or self.visit_id.note,
        })
        return {'type': 'ir.actions.act_window_close'}


class ScVisitRejectWizard(models.TransientModel):
    _name = 'sc.visit.reject.wizard'
    _description = 'Wizard Penolakan Kunjungan'

    visit_id = fields.Many2one(
        comodel_name='sc.visit',
        string='Kunjungan',
        required=True,
        readonly=True,
    )
    rejection_reason = fields.Text(
        string='Alasan Penolakan',
        required=True,
    )

    def action_reject(self):
        """Tolak → status kembali planned, checkin_date & foto dihapus."""
        self.ensure_one()
        if not self.rejection_reason:
            raise exceptions.UserError('Alasan penolakan wajib diisi.')
        self.visit_id.write({
            'state':            'planned',
            'checkin_date':     False,
            'visit_photo':      False,
            'photo_filename':   False,
            'rejection_reason': self.rejection_reason,
        })
        return {'type': 'ir.actions.act_window_close'}
