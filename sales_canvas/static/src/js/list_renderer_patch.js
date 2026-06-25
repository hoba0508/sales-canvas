/** @odoo-module **/
import { ListRenderer } from "@web/views/list/list_renderer";
import { patch } from "@web/core/utils/patch";

/**
 * Odoo 19 bug fix for embedded one2many lists in form views.
 *
 * Root cause: ListRenderer.allColumns can contain undefined entries when an
 * embedded one2many list (X2ManyField) is rendered inside a dialog or a parent
 * form. Several downstream methods then crash when they iterate allColumns and
 * call `'someKey' in undefined` or `.id` on undefined.
 *
 * Known crash sites:
 *   - computeAggregates          → "Cannot read properties of undefined (reading 'id')"
 *   - getFirstAggregateIndex     → "Cannot use 'in' operator to search for ... in undefined"
 *   - getLastAggregateIndex      → same pattern
 *   - getAggregateColumns        → calls getLastAggregateIndex
 *   - getGroupNameCellColSpan    → calls getFirstAggregateIndex
 *
 * Strategy: patch every affected method with a TypeError guard so the list
 * renders without aggregate totals/group spans rather than crashing the form.
 */
patch(ListRenderer.prototype, {
    computeAggregates() {
        try {
            return super.computeAggregates(...arguments);
        } catch (e) {
            if (e instanceof TypeError) return;
            throw e;
        }
    },

    getFirstAggregateIndex() {
        try {
            return super.getFirstAggregateIndex(...arguments);
        } catch (e) {
            if (e instanceof TypeError) return -1;
            throw e;
        }
    },

    getLastAggregateIndex() {
        try {
            return super.getLastAggregateIndex(...arguments);
        } catch (e) {
            if (e instanceof TypeError) return -1;
            throw e;
        }
    },

    getAggregateColumns() {
        try {
            return super.getAggregateColumns(...arguments);
        } catch (e) {
            if (e instanceof TypeError) return [];
            throw e;
        }
    },

    getGroupNameCellColSpan() {
        try {
            return super.getGroupNameCellColSpan(...arguments);
        } catch (e) {
            if (e instanceof TypeError) return 1;
            throw e;
        }
    },
});
