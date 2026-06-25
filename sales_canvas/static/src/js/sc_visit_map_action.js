/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, onMounted, onPatched, onWillUnmount, useRef, useState, xml } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

const MAPBOX_GL_VERSION = "3.3.0";
const MAPBOX_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.css`;
const MAPBOX_JS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_GL_VERSION}/mapbox-gl.js`;

const STATE_LABEL = {
    planned: "📅 Direncanakan",
    waiting_approval: "⏳ Menunggu Approval",
    visited: "✅ Sudah Dikunjungi",
    done: "🏁 Selesai Dikunjungi",
    cancelled: "❌ Dibatalkan",
};

const STATE_COLOR = {
    planned: "#1a73e8",
    waiting_approval: "#f59e0b",
    visited: "#198754",
    done: "#6d28d9",
    cancelled: "#6b7280",
};

// Apakah state dianggap sudah dikunjungi (tampilkan checkmark di marker)
const STATE_VISITED = { visited: true, done: true };

class ScVisitMapAction extends Component {
    static template = xml`
<div class="sc-visit-map-action o_action"
     style="display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;">

    <!-- ── Header ── -->
    <div style="padding:10px 16px;background:#1a2e1a;color:#fff;
                display:flex;align-items:center;gap:12px;flex-shrink:0;
                box-shadow:0 2px 4px rgba(0,0,0,0.3);">
        <i class="fa fa-map-marker" style="font-size:20px;color:#4caf50;"/>
        <div style="flex:1;min-width:0;">
            <div style="font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                Peta Rencana Kunjungan
                <span t-if="state.optimized and !state.optimizing"
                      style="font-size:11px;font-weight:600;background:#4caf50;color:#fff;
                             padding:2px 8px;border-radius:10px;letter-spacing:0.3px;white-space:nowrap;">
                    ✓ Dioptimalkan
                </span>
            </div>
            <div style="font-size:12px;color:#aaa;margin-top:2px;">
                <span t-if="salesmanName">Salesman: <t t-esc="salesmanName"/></span>
                <span t-if="salesmanName and state.startPointName"> · </span>
                <span t-if="state.startPointName">
                    🏢 Dari: <t t-esc="state.startPointName"/>
                </span>
                <span t-if="state.restoredFromCache"
                      style="color:#81c784;margin-left:6px;"
                      title="Urutan dipulihkan dari sesi sebelumnya">
                    · 💾 Dipulihkan
                </span>
            </div>
        </div>
        <div style="font-size:12px;color:#aaa;text-align:right;flex-shrink:0;margin-right:4px;">
            <div><t t-esc="waypoints.length"/> lokasi</div>
            <div t-if="state.routeInfo" style="color:#4caf50;font-size:11px;">
                🛣️ <t t-esc="state.routeInfo"/>
            </div>
        </div>

        <!-- ── Tombol Reset (hanya muncul saat sudah dioptimalkan) ── -->
        <button t-if="state.optimized and !state.loading and !state.error and !state.noCoords"
                t-on-click="_resetOrder"
                style="display:flex;align-items:center;gap:5px;background:transparent;
                       color:#aaa;border:1px solid #555;border-radius:8px;
                       padding:6px 10px;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">
            <i class="fa fa-undo"/>
            Reset
        </button>

        <!-- ── Tombol Optimalkan Ulang ── -->
        <button t-if="!state.loading and !state.error and !state.noCoords and waypoints.length >= 2"
                t-on-click="_optimizeRoute"
                t-att-disabled="state.optimizing"
                t-att-style="state.optimizing
                    ? 'display:flex;align-items:center;gap:6px;background:#388e3c;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:not-allowed;white-space:nowrap;flex-shrink:0;opacity:0.8;'
                    : 'display:flex;align-items:center;gap:6px;background:#4caf50;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;flex-shrink:0;'">
            <i t-if="state.optimizing" class="fa fa-spinner fa-spin"/>
            <i t-else="" class="fa fa-magic"/>
            <t t-if="state.optimizing">Mengoptimalkan...</t>
            <t t-elif="state.optimized">Optimalkan Ulang</t>
            <t t-else="">Optimalkan Urutan</t>
        </button>
    </div>

    <!-- ── Legend ── -->
    <div t-if="waypoints.length and !state.loading and !state.error and !state.noCoords"
         style="padding:6px 16px;background:#f8f9fa;border-bottom:1px solid #dee2e6;
                display:flex;align-items:center;gap:16px;flex-shrink:0;flex-wrap:wrap;
                font-size:12px;color:#495057;">
        <span t-if="state.startPointName and state.optimized">
            <span style="display:inline-block;width:14px;height:14px;border-radius:3px;
                         background:#ff6f00;vertical-align:middle;margin-right:4px;"/>
            Titik Berangkat
        </span>
        <span>
            <span style="display:inline-block;width:14px;height:14px;border-radius:50%;
                         background:#1a73e8;vertical-align:middle;margin-right:4px;"/>
            Direncanakan
        </span>
        <span>
            <span style="display:inline-block;width:14px;height:14px;border-radius:50%;
                         background:#f59e0b;vertical-align:middle;margin-right:4px;"/>
            Menunggu Approval
        </span>
        <span>
            <span style="display:inline-block;width:14px;height:14px;border-radius:8px;
                         background:#198754;vertical-align:middle;margin-right:4px;"/>
            Sudah Dikunjungi ✓
        </span>
        <span>
            <span style="display:inline-block;width:14px;height:14px;border-radius:8px;
                         background:#6d28d9;vertical-align:middle;margin-right:4px;"/>
            Selesai ✓
        </span>
        <span style="color:#888;">· Klik pin untuk detail · Angka = urutan kunjungan</span>
    </div>

    <!-- ── Loading ── -->
    <div t-if="state.loading"
         style="flex:1;display:flex;flex-direction:column;align-items:center;
                justify-content:center;gap:12px;color:#666;">
        <i class="fa fa-spinner fa-spin fa-2x" style="color:#1a73e8;"/>
        <span style="font-size:14px;" t-esc="state.loadingMsg"/>
    </div>

    <!-- ── Error ── -->
    <div t-elif="state.error"
         style="flex:1;display:flex;align-items:center;justify-content:center;padding:32px;">
        <div style="text-align:center;max-width:480px;background:#fff;
                    border:1px solid #f5c6cb;border-radius:12px;padding:32px;">
            <i class="fa fa-exclamation-triangle fa-3x"
               style="color:#dc3545;margin-bottom:16px;display:block;"/>
            <div style="color:#dc3545;font-weight:700;font-size:16px;margin-bottom:8px;">
                Peta Tidak Dapat Dimuat
            </div>
            <div style="color:#555;font-size:13px;line-height:1.8;white-space:pre-line;"
                 t-esc="state.error"/>
        </div>
    </div>

    <!-- ── No coords ── -->
    <div t-elif="state.noCoords"
         style="flex:1;display:flex;align-items:center;justify-content:center;padding:32px;">
        <div style="text-align:center;max-width:400px;color:#666;">
            <i class="fa fa-map-o fa-3x"
               style="margin-bottom:16px;color:#aaa;display:block;"/>
            <div style="font-size:15px;font-weight:600;margin-bottom:8px;">
                Koordinat Belum Tersedia
            </div>
            <div style="font-size:13px;line-height:1.6;">
                Tidak ada customer dalam Rencana Kunjungan yang sudah memiliki koordinat
                (Latitude / Longitude). Silakan isi koordinat melalui tombol
                <strong>Geo Localize</strong> pada form Contact masing-masing customer.
            </div>
        </div>
    </div>

    <!-- ── Map wrapper ── -->
    <div t-else=""
         style="flex:1;min-height:0;position:relative;overflow:hidden;">
        <div t-ref="map"
             style="position:absolute;top:0;left:0;right:0;bottom:0;"/>
    </div>

</div>
    `;

    static props = ["action", "actionStack?"];

    setup() {
        this.mapRef = useRef("map");
        this.orm = useService("orm");
        this.state = useState({
            loading: true,
            loadingMsg: "Memuat peta...",
            error: null,
            noCoords: false,
            routeInfo: null,
            optimizing: false,
            optimized: false,
            startPointName: null,
            // true jika urutan dipulihkan dari cache sessionStorage
            restoredFromCache: false,
        });
        this._resizeObserver = null;
        this._pendingToken = null;
        this._map = null;
        this._markers = [];
        this._orderedWaypoints = null;
        this._token = null;
        this._startPoint = null;

        onMounted(() => this._init());

        onPatched(() => {
            if (this._pendingToken && this.mapRef.el) {
                const token = this._pendingToken;
                this._pendingToken = null;
                this._renderMap(token);
            }
        });

        onWillUnmount(() => {
            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }
            if (this._map) {
                this._map.remove();
                this._map = null;
            }
        });
    }

    get waypoints() {
        return this.props.action.params?.waypoints || [];
    }

    get salesmanName() {
        return this.props.action.params?.salesman_name || "";
    }

    get _activeWaypoints() {
        return this._orderedWaypoints || this.waypoints;
    }

    // ── Cache key unik per salesman + hari ini + jumlah & nama waypoints ────
    _getCacheKey() {
        const today = new Date().toISOString().slice(0, 10);
        const wpSig = this.waypoints.map((w) => w.name).join("|");
        let h = 0;
        for (let i = 0; i < wpSig.length; i++) {
            h = Math.imul(31, h) + wpSig.charCodeAt(i) | 0;
        }
        const sig = Math.abs(h).toString(16);
        return `sc_map_order_${today}_${sig}`;
    }

    // Simpan urutan optimal ke sessionStorage (bertahan selama tab masih buka)
    _saveCache(orderedWaypoints) {
        try {
            sessionStorage.setItem(this._getCacheKey(), JSON.stringify(orderedWaypoints));
        } catch (_) {}
    }

    // Pulihkan urutan dari cache; return true jika berhasil
    _restoreCache() {
        try {
            const raw = sessionStorage.getItem(this._getCacheKey());
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length !== this.waypoints.length) return false;
            this._orderedWaypoints = parsed;
            this.state.optimized = true;
            this.state.restoredFromCache = true;
            return true;
        } catch (_) {
            return false;
        }
    }

    // Hapus cache untuk session ini
    _clearCache() {
        try { sessionStorage.removeItem(this._getCacheKey()); } catch (_) {}
    }

    async _init() {
        if (!this.waypoints.length) {
            this.state.loading = false;
            this.state.noCoords = true;
            return;
        }

        this.state.loadingMsg = "Mengambil konfigurasi Mapbox...";
        let token;
        try {
            token = await this.orm.call(
                "ir.config_parameter",
                "get_param",
                ["web.map.mapbox.token"],
                {}
            );
        } catch (e) {
            this.state.loading = false;
            this.state.error =
                "Gagal mengakses konfigurasi sistem.\n" +
                "Pastikan Anda memiliki hak akses yang cukup.";
            return;
        }

        if (!token) {
            this.state.loading = false;
            this.state.error =
                "Token Mapbox belum dikonfigurasi.\n\n" +
                "Silakan buka:\nSettings → Technical → Parameters → System Parameters\n\n" +
                "Tambahkan key: web.map.mapbox.token\n" +
                "dengan nilai token Mapbox Anda.";
            return;
        }

        this._token = token;

        // ── Ambil koordinat kantor ─────────────────────────────────────────────
        this.state.loadingMsg = "Mengambil lokasi kantor...";
        try { await this._fetchOfficeCoords(); } catch (_) {}

        // ── Muat Mapbox GL JS ──────────────────────────────────────────────────
        this.state.loadingMsg = "Memuat pustaka peta...";
        try {
            await _loadMapboxGL();
        } catch (e) {
            this.state.loading = false;
            this.state.error =
                "Gagal memuat Mapbox GL JS dari CDN.\n" +
                "Periksa koneksi internet server Anda.";
            return;
        }

        // ── Cek cache sessionStorage ──────────────────────────────────────────
        // Jika ada urutan tersimpan (dari sesi yang sama / setelah refresh),
        // langsung pulihkan — tidak perlu panggil Matrix API lagi.
        const restored = this._restoreCache();

        if (!restored && this.waypoints.length >= 2) {
            // ── Auto-optimasi pertama kali (sebelum render peta) ──────────────
            // Dilakukan di sini sehingga peta hanya dirender SEKALI
            // langsung dengan urutan yang sudah optimal.
            this.state.loadingMsg = "Mengoptimalkan rute...";
            await this._runOptimization();
        }

        // Trigger render peta (via onPatched setelah OWL update DOM)
        this._pendingToken = token;
        this.state.loading = false;
    }

    async _fetchOfficeCoords() {
        const params = this.props.action.params || {};
        if (params.office_lat && params.office_lng) {
            this._startPoint = {
                lat: params.office_lat,
                lng: params.office_lng,
                name: params.office_name || "Kantor",
            };
            this.state.startPointName = this._startPoint.name;
            return;
        }

        const companies = await this.orm.searchRead(
            "res.company", [], ["name", "partner_id"], { limit: 1 }
        );
        if (!companies.length) return;

        const partnerId = Array.isArray(companies[0].partner_id)
            ? companies[0].partner_id[0]
            : companies[0].partner_id;

        const partners = await this.orm.searchRead(
            "res.partner",
            [["id", "=", partnerId]],
            ["partner_latitude", "partner_longitude"]
        );
        if (!partners.length) return;

        const { partner_latitude: lat, partner_longitude: lng } = partners[0];
        if (!lat || !lng) return;

        this._startPoint = { lat, lng, name: companies[0].name || "Kantor" };
        this.state.startPointName = this._startPoint.name;
    }

    // ── Core TSP logic (dipakai oleh auto-init dan tombol manual) ────────────
    async _runOptimization() {
        const waypoints = this.waypoints;
        const hasStart = !!this._startPoint;
        const MAX_CUSTOMERS = hasStart ? 24 : 25;
        const wps = waypoints.slice(0, MAX_CUSTOMERS);

        const allPoints = hasStart ? [this._startPoint, ...wps] : wps;
        const coordStr = allPoints.map((p) => `${p.lng},${p.lat}`).join(";");
        const url =
            `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordStr}` +
            `?annotations=duration&access_token=${this._token}`;

        const res = await fetch(url);
        const data = await res.json();
        if (data.code !== "Ok" || !data.durations) {
            throw new Error(data.message || "Matrix API gagal");
        }

        const order = _nearestNeighborTSP(data.durations, allPoints.length, 0);
        const customerOrder = hasStart
            ? order.filter((i) => i !== 0).map((i) => wps[i - 1])
            : order.map((i) => wps[i]);

        if (waypoints.length > MAX_CUSTOMERS) {
            customerOrder.push(...waypoints.slice(MAX_CUSTOMERS));
        }

        this._orderedWaypoints = customerOrder;
        this.state.optimized = true;
        this.state.restoredFromCache = false;
        this._saveCache(customerOrder); // simpan ke sessionStorage
    }

    // ── Tombol "Optimalkan Ulang" ─────────────────────────────────────────────
    async _optimizeRoute() {
        if (this.state.optimizing) return;
        this.state.optimizing = true;
        this.state.routeInfo = null;
        this.state.restoredFromCache = false;

        try {
            await this._runOptimization();
            this._renderMap(this._token);
        } catch (e) {
            console.warn("[SC] Optimasi rute gagal:", e);
            _showToast("Gagal mengoptimalkan urutan. Periksa koneksi internet.", "error");
        } finally {
            this.state.optimizing = false;
        }
    }

    // ── Tombol "Reset Urutan" ─────────────────────────────────────────────────
    _resetOrder() {
        this._clearCache();
        this._orderedWaypoints = null;
        this.state.optimized = false;
        this.state.restoredFromCache = false;
        this.state.routeInfo = null;
        this._renderMap(this._token);
    }

    _renderMap(token) {
        const waypoints = this._activeWaypoints;
        window.mapboxgl.accessToken = token;

        const centerLng = waypoints.reduce((s, w) => s + w.lng, 0) / waypoints.length;
        const centerLat = waypoints.reduce((s, w) => s + w.lat, 0) / waypoints.length;

        if (this._map) {
            this._map.remove();
            this._map = null;
            this._markers = [];
        }

        const map = new window.mapboxgl.Map({
            container: this.mapRef.el,
            style: "mapbox://styles/mapbox/streets-v12",
            center: [centerLng, centerLat],
            zoom: 11,
        });
        this._map = map;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (this.mapRef.el) map.resize();
            });
        });

        if (this._resizeObserver) this._resizeObserver.disconnect();
        this._resizeObserver = new ResizeObserver(() => map.resize());
        this._resizeObserver.observe(this.mapRef.el);

        // ── Marker kantor ─────────────────────────────────────────────────────
        if (this.state.optimized && this._startPoint) {
            const officeEl = document.createElement("div");
            officeEl.title = this._startPoint.name;
            officeEl.style.cssText = [
                "background:#ff6f00", "color:#fff", "border-radius:6px",
                "width:34px", "height:34px", "display:flex",
                "align-items:center", "justify-content:center",
                "font-size:18px", "border:2px solid #fff",
                "box-shadow:0 2px 10px rgba(0,0,0,0.5)", "cursor:default",
            ].join(";");
            officeEl.textContent = "🏢";

            new window.mapboxgl.Marker({ element: officeEl })
                .setLngLat([this._startPoint.lng, this._startPoint.lat])
                .setPopup(
                    new window.mapboxgl.Popup({ offset: 20 }).setHTML(`
                        <div style="font-size:13px;font-weight:700;color:#ff6f00;">
                            🏢 ${_esc(this._startPoint.name)}
                        </div>
                        <div style="font-size:11px;color:#555;margin-top:2px;">Titik Berangkat</div>
                    `)
                )
                .addTo(map);
        }

        // ── Marker customer bernomor ───────────────────────────────────────────
        this._markers = [];
        waypoints.forEach((wp, idx) => {
            const color = STATE_COLOR[wp.state] || "#1a73e8";
            const isVisited = STATE_VISITED[wp.state] || false;
            const el = document.createElement("div");
            // Shape: lingkaran untuk planned, rounded-square untuk visited/done
            const borderRadius = isVisited ? "8px" : "50%";
            const border = isVisited ? "2.5px solid #fff" : "2px solid #fff";
            el.style.cssText = [
                `background:${color}`, "color:#fff", `border-radius:${borderRadius}`,
                "width:32px", "height:32px", "display:flex",
                "align-items:center", "justify-content:center",
                "font-weight:700", "font-size:14px",
                `border:${border}`,
                "box-shadow:0 2px 8px rgba(0,0,0,0.45)",
                "cursor:pointer", "user-select:none",
            ].join(";");
            // Tampilkan nomor + checkmark untuk yang sudah dikunjungi
            if (isVisited) {
                el.innerHTML = `<span style="font-size:11px;font-weight:900;">${idx + 1}</span><span style="font-size:10px;margin-left:1px;">✓</span>`;
            } else {
                el.textContent = String(idx + 1);
            }

            const popupHtml = `
                <div style="font-size:13px;max-width:220px;line-height:1.5;">
                    <div style="font-weight:700;font-size:14px;margin-bottom:4px;">
                        ${idx + 1}. ${_esc(wp.name)}
                    </div>
                    <div style="color:#555;">📅 ${_esc(wp.visit_date)}</div>
                    <div style="color:${color};font-weight:600;">
                        ${STATE_LABEL[wp.state] || wp.state}
                    </div>
                    ${wp.note
                        ? `<div style="color:#888;font-size:11px;margin-top:4px;
                                      border-top:1px solid #eee;padding-top:4px;">
                               ${_esc(wp.note)}
                           </div>`
                        : ""}
                </div>
            `;

            const marker = new window.mapboxgl.Marker({ element: el })
                .setLngLat([wp.lng, wp.lat])
                .setPopup(new window.mapboxgl.Popup({ offset: 20 }).setHTML(popupHtml))
                .addTo(map);
            this._markers.push(marker);
        });

        map.on("load", () => {
            const routePoints =
                this.state.optimized && this._startPoint
                    ? [this._startPoint, ...waypoints]
                    : waypoints;
            if (routePoints.length >= 2) {
                this._drawRoute(map, token, routePoints);
            }
        });
    }

    async _drawRoute(map, token, points) {
        const pts = points.slice(0, 25);
        const coords = pts.map((p) => `${p.lng},${p.lat}`).join(";");
        const url =
            `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
            `?geometries=geojson&overview=full&access_token=${token}`;

        let data;
        try {
            const res = await fetch(url);
            data = await res.json();
        } catch (e) {
            console.warn("[SC] Directions API error:", e);
            return;
        }

        if (!data.routes?.length) return;

        const geometry = data.routes[0].geometry;

        if (map.getLayer("sc-route-line")) map.removeLayer("sc-route-line");
        if (map.getLayer("sc-route-casing")) map.removeLayer("sc-route-casing");
        if (map.getSource("sc-route")) map.removeSource("sc-route");

        map.addSource("sc-route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry },
        });
        map.addLayer({
            id: "sc-route-casing", type: "line", source: "sc-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#fff", "line-width": 7, "line-opacity": 0.6 },
        });
        map.addLayer({
            id: "sc-route-line", type: "line", source: "sc-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#1a73e8", "line-width": 4, "line-opacity": 0.9 },
        });

        const { distance, duration } = data.routes[0];
        const distKm = (distance / 1000).toFixed(1);
        const durMin = Math.round(duration / 60);
        const durText = durMin >= 60
            ? `${Math.floor(durMin / 60)} jam ${durMin % 60} menit`
            : `${durMin} menit`;
        this.state.routeInfo = `${distKm} km · ${durText}`;

        const coords2d = geometry.coordinates;
        const bounds = coords2d.reduce(
            (b, c) => b.extend(c),
            new window.mapboxgl.LngLatBounds(coords2d[0], coords2d[0])
        );
        map.fitBounds(bounds, { padding: 70 });
    }
}

// ── Nearest-Neighbor TSP ──────────────────────────────────────────────────────
function _nearestNeighborTSP(durations, n, startIdx = 0) {
    const visited = new Array(n).fill(false);
    const order = [startIdx];
    visited[startIdx] = true;
    let current = startIdx;

    for (let step = 1; step < n; step++) {
        let best = -1, bestDur = Infinity;
        for (let j = 0; j < n; j++) {
            if (!visited[j] && durations[current][j] < bestDur) {
                bestDur = durations[current][j];
                best = j;
            }
        }
        visited[best] = true;
        order.push(best);
        current = best;
    }
    return order;
}

function _esc(str) {
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _showToast(message, type = "info") {
    const colors = { error: "#dc3545", success: "#198754", info: "#1a73e8" };
    const el = document.createElement("div");
    el.style.cssText =
        "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);" +
        `background:${colors[type] || colors.info};color:#fff;` +
        "padding:10px 20px;border-radius:8px;font-size:13px;" +
        "z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap;";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

function _loadMapboxGL() {
    if (window.mapboxgl) return Promise.resolve();
    return new Promise((resolve, reject) => {
        if (!document.querySelector(`link[href="${MAPBOX_CSS_URL}"]`)) {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = MAPBOX_CSS_URL;
            document.head.appendChild(link);
        }
        const script = document.createElement("script");
        script.src = MAPBOX_JS_URL;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Failed to load Mapbox GL JS"));
        document.head.appendChild(script);
    });
}

registry.category("actions").add("sc_visit_map", ScVisitMapAction);
