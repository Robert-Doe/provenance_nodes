(() => {
    // ---------- Tunables (optional) ----------
    const MAX_NODES = 0;           // 0 = all elements
    const CHILD_CLASS_CAP = 10;    // cap for child_class_tokens in child_shape (0 = no cap)

    // ---------- Small utils ----------
    const enc = new TextEncoder();
    const toHex = (buf) => Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");

    // --- Synchronous SHA-1 and SHA-256 (UTF-8 in, hex out) ---
    function rotl(n, s){ return (n<<s) | (n>>> (32 - s)); }
    function rotr(n, s){ return (n>>>s) | (n << (32 - s)); }

    function sha1Hex(str){
        const bytes = enc.encode(str);
        const ml = bytes.length;
        const withOne = new Uint8Array(((ml + 9 + 63) >> 6) << 6); // pad to multiple of 64
        withOne.set(bytes);
        withOne[ml] = 0x80;
        const bitLen = ml * 8;
        // big-endian 64-bit length at end
        const dv = new DataView(withOne.buffer);
        dv.setUint32(withOne.length - 4, bitLen >>> 0, false);
        // upper 32 bits are zero for lengths < 2^32
        dv.setUint32(withOne.length - 8, Math.floor(bitLen / 2**32), false);

        let h0=0x67452301|0, h1=0xEFCDAB89|0, h2=0x98BADCFE|0, h3=0x10325476|0, h4=0xC3D2E1F0|0;
        const w = new Int32Array(80);

        for(let i=0;i<withOne.length;i+=64){
            for(let j=0;j<16;j++) w[j] = dv.getInt32(i + j*4, false);
            for(let j=16;j<80;j++) w[j] = rotl(w[j-3]^w[j-8]^w[j-14]^w[j-16],1);

            let a=h0,b=h1,c=h2,d=h3,e=h4,t;
            for(let j=0;j<80;j++){
                let f,k;
                if(j<20){ f=(b & c) | ((~b) & d); k=0x5A827999; }
                else if(j<40){ f=b ^ c ^ d; k=0x6ED9EBA1; }
                else if(j<60){ f=(b & c) | (b & d) | (c & d); k=0x8F1BBCDC; }
                else { f=b ^ c ^ d; k=0xCA62C1D6; }
                t = (rotl(a,5) + f + e + k + w[j])|0;
                e=d; d=c; c=rotl(b,30); b=a; a=t;
            }
            h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0;
        }
        const out = new Uint8Array(20);
        const dvOut = new DataView(out.buffer);
        dvOut.setInt32(0,h0,false); dvOut.setInt32(4,h1,false); dvOut.setInt32(8,h2,false);
        dvOut.setInt32(12,h3,false); dvOut.setInt32(16,h4,false);
        return toHex(out);
    }

    // SHA-256 constants
    const K256 = new Int32Array([
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);

    //Get Element Dimension and Position
    function getLayoutSnapshot(el) {
        const r  = el.getBoundingClientRect();
        const sx = window.scrollX || document.documentElement.scrollLeft || 0;
        const sy = window.scrollY || document.documentElement.scrollTop  || 0;
        const cs = window.getComputedStyle(el);

        return {
            // Position & size in the current viewport
            viewport_rect: {
                left: r.left, top: r.top, right: r.right, bottom: r.bottom,
                width: r.width, height: r.height
            },
            // Position on the full document (useful for cross-section alignment checks)
            document_rect: {
                left: r.left + sx, top: r.top + sy,
                right: r.right + sx, bottom: r.bottom + sy,
                width: r.width, height: r.height
            },
            // Box-model helpers (can be handy for alignment heuristics)
            client: { width: el.clientWidth, height: el.clientHeight },
            offset: { width: el.offsetWidth, height: el.offsetHeight },
            scroll: { width: el.scrollWidth, height: el.scrollHeight },

            // A few paint/stacking hints you may want when comparing comment boxes/lists
            z_index: cs.zIndex === "auto" ? null : parseInt(cs.zIndex, 10),
            position: cs.position,          // static|relative|absolute|fixed|sticky
            display: cs.display,            // none|block|flex|…
            visibility: cs.visibility,      // visible|hidden|collapse
            opacity: parseFloat(cs.opacity) // 0..1
        };
    }



    function sha256Hex(str){
        const bytes = enc.encode(str);
        const ml = bytes.length;
        const l = ((ml + 9 + 63) >> 6) << 6; // multiple of 64
        const withOne = new Uint8Array(l);
        withOne.set(bytes);
        withOne[ml] = 0x80;
        const dv = new DataView(withOne.buffer);
        const bigBits = ml * 8;
        // 64-bit big-endian length at end
        dv.setUint32(l - 4, bigBits >>> 0, false);
        dv.setUint32(l - 8, Math.floor(bigBits / 2**32), false);

        let h0=0x6a09e667|0, h1=0xbb67ae85|0, h2=0x3c6ef372|0, h3=0xa54ff53a|0,
            h4=0x510e527f|0, h5=0x9b05688c|0, h6=0x1f83d9ab|0, h7=0x5be0cd19|0;

        const w = new Int32Array(64);

        for(let i=0;i<l;i+=64){
            for(let j=0;j<16;j++) w[j] = dv.getInt32(i + j*4, false);
            for(let j=16;j<64;j++){
                const s0 = (rotr(w[j-15],7) ^ rotr(w[j-15],18) ^ (w[j-15]>>>3))|0;
                const s1 = (rotr(w[j-2],17) ^ rotr(w[j-2],19) ^ (w[j-2]>>>10))|0;
                w[j] = (w[j-16] + s0 + w[j-7] + s1)|0;
            }
            let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
            for(let j=0;j<64;j++){
                const S1 = (rotr(e,6) ^ rotr(e,11) ^ rotr(e,25))|0;
                const ch = ((e & f) ^ ((~e) & g))|0;
                const t1 = (h + S1 + ch + K256[j] + w[j])|0;
                const S0 = (rotr(a,2) ^ rotr(a,13) ^ rotr(a,22))|0;
                const maj = ((a & b) ^ (a & c) ^ (b & c))|0;
                const t2 = (S0 + maj)|0;

                h=g; g=f; f=e; e=(d + t1)|0;
                d=c; c=b; b=a; a=(t1 + t2)|0;
            }
            h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0;
            h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
        }
        const out = new Uint8Array(32);
        const dvOut = new DataView(out.buffer);
        dvOut.setInt32(0,h0,false); dvOut.setInt32(4,h1,false); dvOut.setInt32(8,h2,false); dvOut.setInt32(12,h3,false);
        dvOut.setInt32(16,h4,false); dvOut.setInt32(20,h5,false); dvOut.setInt32(24,h6,false); dvOut.setInt32(28,h7,false);
        return toHex(out);
    }

    // Stable, canonical JSON (sorts keys recursively, no spaces)
    function canonicalJSON(obj) {
        const sortObj = (o) => {
            if (Array.isArray(o)) return o.map(sortObj);
            if (o && typeof o === "object") {
                const out = {};
                for (const k of Object.keys(o).sort()) out[k] = sortObj(o[k]);
                return out;
            }
            return o;
        };
        return JSON.stringify(sortObj(obj));
    }

    // URL normalization like Python version (strip fragment, drop default ports)
    function normalizeUrl(u) {
        const url = new URL(u, location.href);
        url.hash = "";
        if ((url.protocol === "http:"  && url.port === "80") ||
            (url.protocol === "https:" && url.port === "443")) {
            url.port = "";
        }
        if (!url.pathname) url.pathname = "/";
        return url.toString();
    }

    // Class token normalization (kept conservative to match your Python)
    function normalizeClassToken(tok) {
        return String(tok || "").trim().toLowerCase().replace(/_/g, "-");
        // If you want to strip digits/uuid-ish bits later, mirror your commented Python lines here.
    }
    function normClassList(tokens) {
        const set = new Set((tokens || []).map(normalizeClassToken).filter(Boolean));
        return Array.from(set).sort();
    }
    function binCount(n) {
        if (n <= 0) return "0";
        if (n === 1) return "1";
        if (n <= 4) return "2-4";
        return "5+";
    }

    // ---------- DOM facts collection (page-side) ----------
    function toArray(x){ return Array.prototype.slice.call(x || []); }
    function getAbsoluteXPath(el) {
        if (el === document.documentElement) return "/html";
        if (el === document.body) return "/html/body";
        const parts = [];
        while (el && el.nodeType === 1) {
            let ix = 0, sib = el.previousSibling;
            while (sib) { if (sib.nodeType === 1 && sib.nodeName === el.nodeName) ix++; sib = sib.previousSibling; }
            parts.unshift(el.nodeName.toLowerCase() + `[${ix+1}]`);
            el = el.parentElement;
        }
        return "/" + parts.join("/");
    }
    function getCSSPath(el) {
        if (!(el instanceof Element)) return "";
        const path = [];
        while (el && el.nodeType === 1 && el !== document) {
            const tag = el.nodeName.toLowerCase();
            const id = el.id ? `#${CSS.escape(el.id)}` : "";
            let sel = tag + id;
            if (!id) {
                const cls = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/g) : [];
                if (cls.length) sel += "." + cls.map(c => CSS.escape(c)).join(".");
                const parent = el.parentElement;
                if (parent) {
                    const sameTag = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                    if (sameTag.length > 1) {
                        const idx = sameTag.indexOf(el);
                        sel += `:nth-of-type(${idx + 1})`;
                    }
                }
            }
            path.unshift(sel);
            el = el.parentElement;
        }
        return path.join(" > ");
    }
    function textStats(el) {
        const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        const words = txt ? txt.split(/\s+/).filter(Boolean) : [];
        const links = el.querySelectorAll("a").length;
        const emojis = (txt.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
        const punct = (txt.match(/[.,;:!?]/g) || []).length;
        const inlineLike = el.querySelectorAll("span, a, em, strong, code").length;
        const blockLike  = el.querySelectorAll("div, p, li, blockquote, section, article").length;
        const den = inlineLike + blockLike;
        const block_inline_density = den ? +(blockLike / den).toFixed(3) : 0;
        return {
            text_len: txt.length,
            word_count: words.length,
            link_count: links,
            link_word_ratio: words.length ? links / words.length : 0,
            emoji_count: emojis,
            punct_ratio: words.length ? punct / words.length : 0,
            block_inline_density,
            content_anchor_seed: (txt || "").slice(0, 64)
        };
    }
    function childTagHistogram(el) {
        const hist = {};
        for (const ch of el.children) {
            const tag = ch.tagName.toUpperCase();
            hist[tag] = (hist[tag] || 0) + 1;
        }
        return hist;
    }
    function uiHints(el) {
        const hasTime = !!el.querySelector("time[datetime]");
        const hasProfileLink = !!el.querySelector('a[href^="/@"], a[href^="/@@"]');
        const hasActionButtons = !!el.querySelector('button, [role="button"]');
        let hasAvatar = false;
        for (const im of el.querySelectorAll("img")) {
            const w = im.getAttribute("width"); const h = im.getAttribute("height");
            const ws = w ? parseInt(w, 10) : null; const hs = h ? parseInt(h, 10) : null;
            if (ws && hs && Math.abs(ws - hs) <= 4 && ws >= 20 && ws <= 96) { hasAvatar = true; break; }
        }
        return { has_time_datetime: hasTime, has_profile_link: hasProfileLink, has_action_buttons: hasActionButtons, has_avatar_like_img: hasAvatar };
    }
    function depthOf(el) {
        let d = 0, n = el;
        while (n && n.parentElement) { d++; n = n.parentElement; }
        return d;
    }

    // Gather neutral facts for every element
    const allEls = Array.from(document.querySelectorAll("*"));
    const cappedEls = (MAX_NODES && MAX_NODES > 0) ? allEls.slice(0, MAX_NODES) : allEls;
    const elToIndex = new Map(cappedEls.map((el, i) => [el, i]));

    const raw_nodes = cappedEls.map((el, idx) => {
        const classes = (el.className && typeof el.className === "string") ? el.className.trim().split(/\s+/) : [];
        const dataKeys = [];
        const ariaKeys = [];
        let roleVal = el.getAttribute("role");

        for (const a of el.attributes) {
            if (a.name.startsWith("data-")) dataKeys.push(a.name);
            if (a.name.startsWith("aria-")) ariaKeys.push(a.name);
        }

        return {
            idx,
            parent_idx: el.parentElement && elToIndex.has(el.parentElement) ? elToIndex.get(el.parentElement) : null,
            tag: el.tagName.toLowerCase(),
            classes,
            attr_role: roleVal || null,
            data_keys: Array.from(new Set(dataKeys)).sort(),
            aria_keys: Array.from(new Set(ariaKeys)).sort(),
            ui_hints: uiHints(el),
            text_hints: textStats(el),
            child_tag_hist: childTagHistogram(el),
            depth: depthOf(el),
            xpath: getAbsoluteXPath(el),
            css_path: getCSSPath(el),
            layout: getLayoutSnapshot(el),
            outer_html_len: (el.outerHTML || "").length
        };
    });

    // ---------- Document IDs ----------
    const normalizedUrl = normalizeUrl(location.href);
    const html = document.documentElement.outerHTML || "";
    const html_checksum = sha1Hex(html);
    const doc_id = `px:v2:doc:${sha1Hex(normalizedUrl + '|' + html_checksum)}`;

    // ---------- Parent/children index ----------
    const idx_to_children = new Map(raw_nodes.map(n => [n.idx, []]));
    for (const n of raw_nodes) {
        const p = n.parent_idx;
        if (p != null && idx_to_children.has(p)) idx_to_children.get(p).push(n.idx);
    }

    // ---------- First pass: compute SigID v2 (strictly structural) ----------
    const sig_cards = []; // [sig_id, sig_struct, sig_json]
    for (let i = 0; i < raw_nodes.length; i++) {
        const n = raw_nodes[i];

        const classes_norm = normClassList(n.classes || []);

        const hist = n.child_tag_hist || {};
        const child_tags_present = Object.entries(hist).filter(([_, v]) => v > 0).map(([k,_]) => k).sort();
        const child_tag_bins = Object.fromEntries(Object.entries(hist).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, binCount(v)]));

        // unique normalized class tokens from direct children
        const child_class_tokens_set = new Set();
        for (const ch_idx of (idx_to_children.get(i) || [])) {
            const ch_classes = raw_nodes[ch_idx].classes || [];
            for (const t of normClassList(ch_classes)) child_class_tokens_set.add(t);
        }
        let child_class_tokens = Array.from(child_class_tokens_set).sort();
        if (CHILD_CLASS_CAP > 0 && child_class_tokens.length > CHILD_CLASS_CAP) {
            child_class_tokens = child_class_tokens.slice(0, CHILD_CLASS_CAP);
        }

        const attr_keys = {
            role: (n.attr_role ? String(n.attr_role).toLowerCase() : null),
            data_keys: n.data_keys || [],
            aria_keys: n.aria_keys || [],
        };

        const sig_struct = {
            tag: n.tag,
            // classes_norm,
            attr_keys,
            child_shape: {
                child_tags_present,
                child_tag_bins,
                // child_class_tokens
            }
        };
        const sig_json = canonicalJSON(sig_struct);
        const sig_id = `px:v2:sig:${sha1Hex(sig_json)}`;
        sig_cards.push([sig_id, sig_struct, sig_json]);
    }

    // ---------- SigPath + sibling ranks among SAME SigID ----------
    const sig_id_by_idx = Object.fromEntries(raw_nodes.map((_, i) => [i, sig_cards[i][0]]));
    const parent_idx = Object.fromEntries(raw_nodes.map((n, i) => [i, n.parent_idx != null ? n.parent_idx : null]));
    const rank_among_same_sig = {};
    const siblings_same_sig_total = {};

    for (const [p, kids] of idx_to_children.entries()) {
        const groups = new Map();
        for (const k of kids) {
            const sid = sig_id_by_idx[k];
            if (!groups.has(sid)) groups.set(sid, []);
            groups.get(sid).push(k);
        }
        for (const [sid, members] of groups.entries()) {
            members.forEach((k, rank) => { rank_among_same_sig[k] = rank; });
            members.forEach((k) => { siblings_same_sig_total[k] = members.length; });
        }
    }

    function build_sigpath(i) {
        const path = [];
        let cur = i, guard = 0;
        while (cur != null && guard < 10000) {
            path.push(sig_id_by_idx[cur]);
            cur = parent_idx[cur];
            guard++;
        }
        path.reverse();
        return path;
    }

    // ---------- Build records (node_id, crypto_id, parents/children) ----------
    const records = [];
    const idx_to_node_id = {};

    for (let i = 0; i < raw_nodes.length; i++) {
        const n = raw_nodes[i];
        const [sig_id, sig_struct] = sig_cards[i];
        const sigpath = build_sigpath(i);

        const rank = rank_among_same_sig[i] ?? 0;
        const same_total = siblings_same_sig_total[i] ?? 1;

        const content_anchor_seed = n.text_hints?.content_anchor_seed || "";
        const content_anchor = content_anchor_seed ? `txt16:${sha1Hex(content_anchor_seed)}` : null;

        const node_id_raw = canonicalJSON({
            doc: doc_id,
            sigpath,
            rank_among_same_sig: rank,
            content_anchor,
        });
        const node_id = `px:v2:node:${sha1Hex(node_id_raw)}`;

        const crypto_id = `px:v2:crypto:${sha256Hex(doc_id + '|' + n.xpath)}`;

        const rec = {
            doc_id,
            node_id,
            crypto_id,
            parent_id: null,           // fill later
            sig_id: sig_id,
            sig: sig_struct,           // structural-only (what was hashed)
            signals: {
                ui_hints: n.ui_hints,
                text_hints: {
                    text_len: n.text_hints.text_len,
                    word_count: n.text_hints.word_count,
                    link_count: n.text_hints.link_count,
                    link_word_ratio: n.text_hints.link_word_ratio,
                    emoji_count: n.text_hints.emoji_count,
                    punct_ratio: n.text_hints.punct_ratio,
                    block_inline_density: n.text_hints.block_inline_density
                },
                depth: n.depth,
                child_tag_hist: n.child_tag_hist,
                layout: n.layout
            },
            locators: {
                xpath: n.xpath,
                css_path: n.css_path,
                sigpath
            },
            sibling: {
                rank_among_same_sig: rank,
                siblings_same_sig_total: same_total
            },
            content_anchor,
            children_ids: []           // fill later
        };

        records.push(rec);
        idx_to_node_id[i] = node_id;
    }

    // Fill parent/children links
    for (let i = 0; i < raw_nodes.length; i++) {
        const pidx = raw_nodes[i].parent_idx;
        if (pidx != null && pidx >= 0 && pidx < raw_nodes.length) {
            records[i].parent_id = idx_to_node_id[pidx];
            records[pidx].children_ids.push(idx_to_node_id[i]);
        }
    }

    // ---------- Publish & log ----------
    const result = { doc_id, url: normalizedUrl, count: records.length, records, raw_nodes };
    window.__px_last_scan = result;

    console.log(`[PX] Scan complete: ${records.length} nodes`);
    console.log(`[PX] doc_id: ${doc_id}`);
    console.log(`[PX] Result on window.__px_last_scan (records, raw_nodes, url, doc_id).`);

    return result;
})();


/////////////////////////////////////////////////////////////////////////////////////////////////////


const MIN_K = 3;
const ONLY_OUTER_TEMPLATES = 1;
const MAX_PER_INSTANCE = 2;
const MIN_INTERNAL_DEPTH = 3;

// ===== Input guard =====
const scan = window.__px_last_scan;
if (!scan || !Array.isArray(scan.records)) {
    throw new Error("[PX] Missing __px_last_scan.records. Run the first scan script on this page first.");
}
const nodes = scan.records;




// ===== Indexes =====
const xpath_to_nodes = new Map();
for (const n of nodes) {
    const xp = n?.locators?.xpath;
    if (xp) {
        if (!xpath_to_nodes.has(xp)) xpath_to_nodes.set(xp, []);
        xpath_to_nodes.get(xp).push(n);
    }
}
const children_by_parent = new Map();
for (const n of nodes) {
    const pid = n.parent_id;
    if (!pid) continue;
    if (!children_by_parent.has(pid)) children_by_parent.set(pid, []);
    children_by_parent.get(pid).push(n);
}




// ===== Helpers =====
const xpath_steps = (xp) => String(xp || "").split('/').filter(Boolean);
const step_tag = (step) => step.split('[', 1)[0];
const wildcard_step = (step) => `${step_tag(step)}[*]`;
const join_from_steps = (steps) => '/' + steps.join('/');

const first_divergent_step = (rows) => {
    if (!rows?.length) return -1;
    const L = rows[0].length;
    if (rows.some(r => r.length !== L)) return -1;
    for (let i=0;i<L;i++) {
        const val = rows[0][i];
        for (let j=1;j<rows.length;j++) if (rows[j][i]!==val) return i;
    }
    return -1;
};

const build_outer_template_and_slot_examples = (xpaths) => {
    const step_rows = (xpaths||[]).filter(Boolean).map(xpath_steps);
    if (!step_rows.length) return {template:"",slot_examples:[]};
    const slot_i = first_divergent_step(step_rows);
    if (slot_i === -1) {
        const base = step_rows[0].slice();
        base[base.length-1] = wildcard_step(base[base.length-1]);
        return { template: join_from_steps(base),
            slot_examples: step_rows.map(r => join_from_steps(r)) };
    }
    const templ_steps = [
        ...step_rows[0].slice(0,slot_i),
        wildcard_step(step_rows[0][slot_i]),
        ...step_rows[0].slice(slot_i+1)
    ];
    return {
        template: join_from_steps(templ_steps),
        slot_examples: step_rows.map(r => join_from_steps(r.slice(0,slot_i+1)))
    };
};


const split_template = (t)=>{
    const steps=xpath_steps(t);
    let wi=-1;
    for(let i=0;i<steps.length;i++) if(steps[i].endsWith("[*]")){wi=i;break;}
    return{steps,wi};
};
const template_prefix_equals=(a,a_i,b,b_i)=>{
    if(a_i!==b_i)return false;
    for(let i=0;i<a_i;i++)if(a[i]!==b[i])return false;
    return step_tag(a[a_i])===step_tag(b[b_i]);
};
const a_dominates_b_keep_outer=(a,b)=>{
    const A=split_template(a),B=split_template(b);
    if(A.wi===-1||B.wi===-1)return false;
    if(!template_prefix_equals(A.steps,A.wi,B.steps,B.wi))return false;
    return A.steps.length < B.steps.length;
};





// ===== Aggregate repeating sigs =====
const parents_summary = [];
const template_to_instances = new Map();
const template_examples = new Map();

for (const [pid, childs] of children_by_parent.entries()) {
    const sig_counts = new Map();
    for (const c of childs) {
        const s = c.sig_id; if (!s) continue;
        sig_counts.set(s,(sig_counts.get(s)||0)+1);
    }
    const reps = [];
    const sorted = Array.from(sig_counts.entries())
        .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
    for (const [sid,cnt] of sorted) {
        if (cnt < MIN_K) continue;
        const members = childs.filter(ch => ch.sig_id === sid);
        const mpaths  = members.map(ch => ch?.locators?.xpath).filter(Boolean);
        if (!mpaths.length) continue;
        const { template, slot_examples } = build_outer_template_and_slot_examples(mpaths);
        reps.push({
            child_sig_id:sid, count:cnt,
            block_xpath_template:template,
            example_concrete_block_xpaths:slot_examples.slice(0,5),
            children:members
        });
        if (!template_to_instances.has(template)) template_to_instances.set(template,new Set());
        const perInst = new Map();
        for (const s of slot_examples) {
            const seen = perInst.get(s) || 0;
            if (seen >= MAX_PER_INSTANCE) continue;
            perInst.set(s, seen+1);
            template_to_instances.get(template).add(s);
        }
        if (!template_examples.has(template)) template_examples.set(template,[]);
        const arr = template_examples.get(template);
        for (const s of slot_examples) {
            if (arr.length >= 5) break;
            if (!arr.includes(s)) arr.push(s);
        }
    }
    parents_summary.push({
        parent_node_id: pid,
        children: childs,
        all_child_sig_id_counts: Object.fromEntries(sig_counts),
        repeating_groups: reps
    });
}



// ===== Prune + depth filters =====
const isSubset = (a,b)=>{for(const v of b) if(!a.has(v)) return false; return true;};
const prune = (m,e,onlyOuter)=>{
    if(!onlyOuter) return {instances:m, examples:e};
    const t = Array.from(m.keys());
    const keep = new Map(t.map(x=>[x,true]));
    for (let i=0;i<t.length;i++) for (let j=0;j<t.length;j++) {
        if (i===j) continue;
        const A=t[i], B=t[j];
        if (!keep.get(A) || !keep.get(B)) continue;
        if (a_dominates_b_keep_outer(A,B)) {
            const SA=m.get(A), SB=m.get(B);
            if (isSubset(SA,SB)) keep.set(B,false);
        }
    }
    const outI=new Map(), outE=new Map();
    for (const name of t) if (keep.get(name)) {
        outI.set(name, m.get(name));
        outE.set(name, e.get(name) || []);
    }
    return {instances:outI, examples:outE};
};
let {instances:prunedI, examples:prunedE} =
    prune(template_to_instances, template_examples, !!ONLY_OUTER_TEMPLATES);

// New interpretation:
//   minDepth = MIN_INTERNAL_DEPTH = minimum depth from the slot element
//              to its deepest descendant *within that block*.
//
//   minKids  = MIN_SLOT_INSTANCES_WITH_CHILDREN (same meaning as before).

const filterDepth = (m, e, x2n, minInternalDepth) => {
    const ki = new Map();
    const ke = new Map();

    // Build node_id -> node lookup so we can walk children_ids.
    const nodeById = new Map();
    for (const arr of x2n.values()) {
        for (const n of arr) {
            if (n && n.node_id) nodeById.set(n.node_id, n);
        }
    }

    // Compute maximum descendant signals.depth for a node
    function maxDescendantDepth(startNode) {
        let maxDepth = startNode.signals?.depth ?? 0;
        const stack = [startNode];

        while (stack.length) {
            const node = stack.pop();
            const d = node.signals?.depth ?? 0;
            if (d > maxDepth) maxDepth = d;

            const kids = node.children_ids || [];
            for (const childId of kids) {
                const child = nodeById.get(childId);
                if (child) stack.push(child);
            }
        }
        return maxDepth;
    }

    for (const [template, instanceSet] of m.entries()) {
        if (!instanceSet.size) continue;

        let bestInternalDepth = 0;

        for (const xp of instanceSet) {
            const nodesForXPath = x2n.get(xp) || [];
            if (!nodesForXPath.length) continue;

            const slotNode = nodesForXPath[0];

            const ownDepth = slotNode.signals?.depth ?? 0;
            const maxDepth = maxDescendantDepth(slotNode);
            const internalDepth = Math.max(0, maxDepth - ownDepth);

            if (internalDepth > bestInternalDepth) {
                bestInternalDepth = internalDepth;
            }
        }

        if (bestInternalDepth < minInternalDepth) continue;

        ki.set(template, instanceSet);
        ke.set(template, (e.get(template) || []).slice());
    }

    return { instances: ki, examples: ke };
};
({ instances: prunedI, examples: prunedE } =
    filterDepth(prunedI, prunedE, xpath_to_nodes, MIN_INTERNAL_DEPTH));



/////////////////////////////////////////features detector///////////////////////////////////////////////////////////////

function detectRelatedKeyword(rootEl) {
    if (!rootEl) {
        return { has_related_keyword: false };
    }

    // ~50-ish tokens that often show up around comments / replies / threads
    const RELATED_KEYWORDS = [
        // core "comment" variants
        "comment", "comments", "commenter", "commenting",
        "comment-body", "comment_body", "commenttext", "comment-text",
        "commentlist", "comment-list", "commentthread", "comment-thread",

        // short forms
        "cmt", "cmnt",

        // reply / response
        "reply", "replies", "respond", "response", "responses",
        "replyto", "reply-to", "in-reply-to",

        // discussion / thread / conversation
        "discussion", "discussions", "thread", "threads",
        "conversation", "conversations", "conv",

        // message / post
        "message", "messages", "msg", "msgs",
        "post", "posts", "posting", "posted",

        // feedback / review / rating
        "feedback", "review", "reviews", "rating", "ratings",

        // general talk-ish
        "chat", "chats", "forum", "forums", "topic", "topics",

        // opinion / reaction / remark / note
        "opinion", "opinions", "reaction", "reactions",
        "remark", "remarks", "note", "notes",

        // annotations (inline comments)
        "annotation", "annotations", "inline-comment", "inlinecomments"
    ];

    // helper: does a string relate to any keyword?
    function matchesRelated(str) {
        if (!str) return false;
        const text = String(str).toLowerCase();

        for (const kw of RELATED_KEYWORDS) {
            const key = kw.toLowerCase();

            // substring in BOTH directions (as requested)
            // - attribute contains keyword
            // - keyword contains attribute (useful if attribute is short token)
            if (text.includes(key) || key.includes(text)) {
                return true;
            }
        }
        return false;
    }

    let has_related_keyword = false;

    const walker = document.createTreeWalker(
        rootEl,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
    );

    function checkElement(el) {
        // 1. Check element's own text content
        const text = (el.textContent || "").trim();
        if (matchesRelated(text)) {
            has_related_keyword = true;
            return;
        }

        // 2. Check common attribute bundles directly
        if (matchesRelated(el.className)) {
            has_related_keyword = true;
            return;
        }
        if (matchesRelated(el.id)) {
            has_related_keyword = true;
            return;
        }

        // 3. Check all attributes: names AND values
        if (el.attributes) {
            for (const attr of el.attributes) {
                const attrName  = attr.name.toLowerCase();
                const attrValue = (attr.value || "").toLowerCase();

                if (matchesRelated(attrName) || matchesRelated(attrValue)) {
                    has_related_keyword = true;
                    return;
                }
            }
        }
    }

    // check rootEl itself
    checkElement(rootEl);

    while (!has_related_keyword && walker.nextNode()) {
        const el = walker.currentNode;
        checkElement(el);
    }

    return { has_related_keyword };
}
function detectMicroactions(rootEl) {
    if (!rootEl) return { has_microaction: false, action_count: 0 };

    // Allowed tags that commonly carry interaction actions
    const ACTION_TAGS = new Set(["BUTTON", "A", "SPAN", "DIV", "SVG", "IMG"]);

    // All microaction keywords (normalized to lowercase)
    const MICROACTION_KEYWORDS = [
        // reply
        "reply", "respond", "answer", "quote",

        // vote/like
        "like", "upvote", "heart", "dislike", "downvote",

        // share/permalink
        "share", "permalink", "copylink", "copy link",

        // report/moderation
        "report", "flag", "block", "mute"
    ];

    // Normalize tokens for boundary-safe matching
    const tokens = MICROACTION_KEYWORDS.map(t => t.toLowerCase());

    let has_microaction = false;
    let action_count = 0; // number of *distinct* categories matched

    // Deduplicate categories encountered
    const matchedCategories = new Set();

    /**
     * Check if a string contains any token
     */
    function matchTokens(str) {
        if (!str) return null;
        const text = str.toLowerCase();

        for (const token of tokens) {
            // Use boundary-safe: check as whole word or simple substring
            if (text.includes(token)) {
                return token; // return the actual matched token
            }
        }
        return null;
    }

    /**
     * Traverse all descendants (including root)
     */
    const walker = document.createTreeWalker(
        rootEl,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
    );

    while (walker.nextNode()) {
        const el = walker.currentNode;

        // Must match one of the allowed tags
        if (!ACTION_TAGS.has(el.tagName)) continue;

        // 1. Check textContent
        const tokenFromText = matchTokens(el.textContent);
        if (tokenFromText) {
            has_microaction = true;
            matchedCategories.add(tokenFromText);
        }

        // 2. Check all attributes (both name and value)
        for (const attr of el.attributes) {
            const tokenFromName = matchTokens(attr.name);
            if (tokenFromName) {
                has_microaction = true;
                matchedCategories.add(tokenFromName);
            }

            const tokenFromValue = matchTokens(attr.value);
            if (tokenFromValue) {
                has_microaction = true;
                matchedCategories.add(tokenFromValue);
            }
        }
    }

    // Distinct action types found
    action_count = matchedCategories.size;

    return { has_microaction, action_count };
}
function detectMetadata(rootEl) {
    if (!rootEl) {
        return {
            has_author: false,
            has_avatar: false,
            has_timestamp: false
        };
    }

    // Likely author carriers
    const AUTHOR_TAGS = new Set(["A", "SPAN", "DIV"]);
    const AUTHOR_KEYWORDS = [
        "author", "user", "username", "profile", "byline", "handle", "nickname"
    ];

    // Likely avatar carriers
    const AVATAR_TAGS = new Set(["IMG", "DIV", "SPAN"]);
    const AVATAR_KEYWORDS = [
        "avatar", "userpic", "profile-pic", "profilepic", "user-icon", "userphoto", "user-photo"
    ];

    // Attribute names that often carry timestamps
    const TIMESTAMP_ATTR_NAMES = [
        "datetime", "data-time", "data-timestamp", "data-created", "data-epoch"
    ];

    // Regexes for text-based timestamps

    // relative age: "3 hours ago", "5 mins ago", etc.
    const RELATIVE_AGE_REGEX =
        /\b\d+\s*(sec|second|min|minute|hour|hr|day|week|month|year)s?\s*ago\b/;

    // simple numeric ISO-ish dates: "2024-05-12", "2023/1/2"
    const ABSOLUTE_DATE_REGEX =
        /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/;

    // month names and short forms:
    //  - "Jan 3, 2024"
    //  - "3 Jan 2024"
    //  - "January 3, 2024"
    //  - "3 January 2024"
    const MONTH_NAME_DATE_REGEX = new RegExp(
        String.raw`\b(?:` +
        // month names / short forms
        `(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|` +
        `jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|` +
        `oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)` +
        // "Jan 3" or "January 3"
        `\s+\d{1,2}` +
        // optional comma
        `,?` +
        // optional year (e.g., 2024)
        `(?:\s+20\\d{2})?` +
        `|` +
        // "3 Jan" or "3 January"
        `\d{1,2}\s+` +
        `(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|` +
        `jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|` +
        `oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)` +
        // optional comma
        `,?` +
        // optional year
        `(?:\s+20\\d{2})?` +
        `)\b`
    );

    function containsKeyword(str, keywords) {
        if (!str) return false;
        const text = str.toLowerCase();
        return keywords.some(kw => text.includes(kw));
    }

    function isTimestampAttrName(name) {
        const lower = name.toLowerCase();
        return TIMESTAMP_ATTR_NAMES.includes(lower);
    }

    let has_author = false;
    let has_avatar = false;
    let has_timestamp = false;

    const walker = document.createTreeWalker(
        rootEl,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
    );

    function checkElement(el) {
        const tag = el.tagName;

        // ---------- AUTHOR ----------
        if (!has_author && AUTHOR_TAGS.has(tag)) {
            const attrPieces = [
                el.className || "",
                el.id || "",
                el.getAttribute("rel") || "",
                el.getAttribute("itemprop") || "",
                el.getAttribute("data-user") || "",
                el.getAttribute("data-username") || "",
                el.getAttribute("data-author") || ""
            ];
            const attrBlob = attrPieces.join(" ").toLowerCase();

            if (containsKeyword(attrBlob, AUTHOR_KEYWORDS)) {
                const text = (el.textContent || "").trim();
                if (text.length > 1) {
                    has_author = true;
                }
            }
        }

        // ---------- AVATAR ----------
        if (!has_avatar && AVATAR_TAGS.has(tag)) {
            const attrPieces = [
                el.className || "",
                el.id || "",
                el.getAttribute("alt") || "",
                el.getAttribute("title") || ""
            ];
            const attrBlob = attrPieces.join(" ").toLowerCase();

            if (containsKeyword(attrBlob, AVATAR_KEYWORDS)) {
                has_avatar = true;
            }
        }

        // ---------- TIMESTAMP ----------
        if (!has_timestamp) {
            // 1) <time> tag is a strong signal
            if (tag === "TIME") {
                has_timestamp = true;
            }

            // 2) attributes like datetime, data-timestamp, etc.
            if (!has_timestamp && el.attributes) {
                for (const attr of el.attributes) {
                    if (isTimestampAttrName(attr.name)) {
                        has_timestamp = true;
                        break;
                    }
                }
            }

            // 3) text patterns: "3 hours ago", "2024-05-12", "Jan 3, 2024", "3 Jan 2024"
            if (!has_timestamp) {
                const text = (el.textContent || "").toLowerCase().trim();

                if (
                    RELATIVE_AGE_REGEX.test(text) ||
                    ABSOLUTE_DATE_REGEX.test(text) ||
                    MONTH_NAME_DATE_REGEX.test(text)
                ) {
                    has_timestamp = true;
                }
            }
        }
    }

    // check rootEl itself
    checkElement(rootEl);

    while (walker.nextNode()) {
        const el = walker.currentNode;
        checkElement(el);

        if (has_author && has_avatar && has_timestamp) break;
    }

    return { has_author, has_avatar, has_timestamp };
}
function detectCommentCountHeader(rootEl, options = {}) {
    if (!rootEl) {
        return {
            has_comment_count_header: false,
            comment_count: null
        };
    }

    const maxAncestorDepth = options.maxAncestorDepth ?? 10;

    const COMMENT_WORDS = [
        "comment", "comments",
        "reply", "replies",
        "answer", "answers",
        "discussion", "discussions",
        "review", "reviews", "response", "responses"
    ];

    function matchesCommentKeyword(str) {
        if (!str) return false;
        const text = String(str).toLowerCase();
        return COMMENT_WORDS.some(kw => text.includes(kw));
    }

    // Extract number from text where comments/replies/etc. appear
    /* function extractCountFromText(text) {
         if (!text) return null;
         const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

         // First make sure it even talks about comments/replies/etc.
         if (!matchesCommentKeyword(lower)) return null;

         // Patterns:
         //   "comments (23)" / "comments: 23" / "comments 23"
         //   "(23) comments" / "23 comments"
         const pattern = new RegExp(
             String.raw`
         \b(?:comments?|replies|answers|discussion|reviews?)\b[^\d]{0,6}\(?(\d{1,5})\)?|
         \(?(\d{1,5})\)?[^\w]{0,6}\b(?:comments?|replies|answers|discussion|reviews?)\b
       `,
             "ix" // ignore case, allow whitespace in pattern
         );

         const match = pattern.exec(lower);
         if (!match) return null;

         const numStr = match[1] || match[2];
         if (!numStr) return null;

         const num = parseInt(numStr, 10);
         return Number.isNaN(num) ? null : num;
     }*/

    function extractCountFromText(text) {
        if (!text) return null;
        const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

        // First ensure keyword present
        if (!matchesCommentKeyword(lower)) return null;

        // REGEX FIXED:
        // Matches:
        //   "comments (23)"
        //   "comments: 23"
        //   "comments 23"
        //   "(23) comments"
        //   "23 comments"
        const pattern = /\b(?:comments?|replies|answers|discussion|reviews?)\b[^\d]{0,6}\(?(\d{1,5})\)?|\(?(\d{1,5})\)?[^\w]{0,6}\b(?:comments?|replies|answers|discussion|reviews?)\b/;

        const match = pattern.exec(lower);
        if (!match) return null;

        const numStr = match[1] || match[2];
        if (!numStr) return null;

        const num = parseInt(numStr, 10);
        return Number.isNaN(num) ? null : num;
    }


    // Sometimes the header text is just "(23)" and the comment-ness is in attributes.
    function extractCountFromBracketOnly(text, el) {
        if (!text || !el) return null;
        const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

        // look for "(23)" or "[23]"
        const m = lower.match(/[\(\[]\s*(\d{1,5})\s*[\)\]]/);
        if (!m) return null;

        // only treat it as a comment count if attributes suggest "comments"
        let attrBlob = (el.className || "") + " " + (el.id || "");
        for (const attr of el.attributes || []) {
            attrBlob += " " + attr.name + " " + attr.value;
        }
        attrBlob = attrBlob.toLowerCase();

        if (!matchesCommentKeyword(attrBlob)) return null;

        const num = parseInt(m[1], 10);
        return Number.isNaN(num) ? null : num;
    }

    // Attributes like data-comments-count="23", comments_count="5", etc.
    function extractCountFromAttributes(el) {
        if (!el || !el.attributes) return null;

        for (const attr of el.attributes) {
            const name = attr.name.toLowerCase();
            const value = (attr.value || "").toLowerCase();

            const isCountName =
                name.includes("count") ||
                name.includes("num") ||
                name.includes("total");

            const looksCommentish =
                matchesCommentKeyword(name) || matchesCommentKeyword(value);

            if (isCountName || looksCommentish) {
                const m = value.match(/\d{1,5}/);
                if (m) {
                    const num = parseInt(m[0], 10);
                    if (!Number.isNaN(num)) return num;
                }
            }
        }
        return null;
    }

    function isHeadingLike(el) {
        if (!el) return false;
        const tag = el.tagName;
        if (/^H[1-6]$/.test(tag)) return true;

        const role = (el.getAttribute("role") || "").toLowerCase();
        if (role === "heading") return true;

        const cls = (el.className || "").toString().toLowerCase();
        if (cls.includes("title") || cls.includes("heading") || cls.includes("header")) {
            return true;
        }

        return false;
    }

    // Collect ancestors up to maxAncestorDepth (including rootEl itself)
    const ancestors = [];
    let current = rootEl;
    let depth = 0;
    while (current && depth <= maxAncestorDepth) {
        ancestors.push(current);
        current = current.parentElement;
        depth++;
    }

    let has_comment_count_header = false;
    let comment_count = null;

    // For each ancestor, search for heading-ish elements that look like comment headers
    for (const ancestor of ancestors) {
        // Limit search: headings + header-ish elements inside this ancestor
        const candidates = ancestor.querySelectorAll(
            "h1,h2,h3,h4,h5,h6,[role='heading'],[class*='title'],[class*='header']"
        );

        for (const headerEl of candidates) {
            const text = (headerEl.textContent || "").trim();

            // 1) Try extracting count directly from text
            let count = extractCountFromText(text);

            // 2) If that failed, try bracket-only pattern + comment-y attrs
            if (count == null) {
                count = extractCountFromBracketOnly(text, headerEl);
            }

            // 3) If still null, check attributes for a data-comments-count-style value
            if (count == null) {
                count = extractCountFromAttributes(headerEl);
            }

            const textBlob = text.toLowerCase();
            const attrsBlob =
                ((headerEl.className || "") + " " + (headerEl.id || "")).toLowerCase();

            const isCommentHeader =
                matchesCommentKeyword(textBlob) || matchesCommentKeyword(attrsBlob);

            if (isCommentHeader || count != null) {
                has_comment_count_header = true;
                if (count != null) {
                    comment_count = count;
                }
                // We can stop once we find the first plausible header
                return { has_comment_count_header, comment_count };
            }
        }
    }

    return { has_comment_count_header, comment_count };
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


const raw_nodes = Array.isArray(scan.raw_nodes) ? scan.raw_nodes : [];
const xpath_to_css = new Map(raw_nodes.map(r => [r.xpath, r.css_path]));

function elByXPath(xp) {
    try {
        return document
            .evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
            .singleNodeValue;
    } catch {
        return null;
    }
}

function elByXPathOrCSS(xp) {
    let el = elByXPath(xp);
    if (el) return el;
    const css = xpath_to_css.get(xp);
    if (css) {
        try { el = document.querySelector(css); } catch {}
    }
    return el || null;
}

// Build a map: template XPath -> aggregated feature booleans
function buildTemplateFeatureMap(instanceMap) {
    const templateFeatures = new Map();

    for (const [templateXPath, instanceSet] of instanceMap.entries()) {
        // Start all features as false; we OR them as we scan instances
        const summary = {
            has_related_keyword: false,
            has_microaction: false,
            has_author: false,
            has_avatar: false,
            has_timestamp: false,
            has_comment_count_header: false
        };

        if (!instanceSet || !instanceSet.size) {
            templateFeatures.set(templateXPath, summary);
            continue;
        }

        // Look at each concrete instance of this template
        outer: for (const instXPath of instanceSet) {
            const instEl = elByXPathOrCSS(instXPath);
            if (!instEl) continue;

            // Use the direct parent as the root block (as you requested)
            const rootEl = instEl.parentElement || instEl;

            // Call your detectors (you'll define these elsewhere)
            const kw = detectRelatedKeyword(rootEl) || {};
            const ma = detectMicroactions(rootEl) || {};
            const md = detectMetadata(rootEl) || {};
            const cc = detectCommentCountHeader(rootEl) || {};

            // Aggregate booleans at the template level
            if (kw.has_related_keyword) summary.has_related_keyword = true;
            if (ma.has_microaction)      summary.has_microaction = true;

            if (md.has_author)           summary.has_author = true;
            if (md.has_avatar)           summary.has_avatar = true;
            if (md.has_timestamp)        summary.has_timestamp = true;

            if (cc.has_comment_count_header) summary.has_comment_count_header = true;

            // If we've already seen all features as true for this template,
            // we can stop scanning more instances for this template.
            if (
                summary.has_related_keyword &&
                summary.has_microaction &&
                summary.has_author &&
                summary.has_avatar &&
                summary.has_timestamp &&
                summary.has_comment_count_header
            ) {
                break outer;
            }
        }

        templateFeatures.set(templateXPath, summary);
    }

    return templateFeatures;
}

// Use prunedI (your filtered template->instances map)
const templateFeatureMap = buildTemplateFeatureMap(prunedI);



//////////////////////////////////////////colour matching templates///////////////////////////////////////////////////////////////////

for (const [templateXPath, instanceSet] of prunedI.entries()) {
    for (const instXPath of instanceSet) {
        const instEl = elByXPathOrCSS(instXPath);
        if (!instEl) continue;

        // same logic you've been using everywhere:
        const parentEl = instEl.parentElement || instEl;

        // Apply heavy visual indication
        parentEl.style.outline = "10px solid red";
        parentEl.style.outlineOffset = "0px";

        // Background color (adjust to whatever you want)
        parentEl.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
        //     light translucent yellow (visible but not destructive)
    }
}

///////////////////////////////////////////////console with hover effect//////////////////////////////////


// === Hover inspector (console logs only, no HTML injection) ===

const _pxHoverBound = new WeakSet();

for (const [templateXPath, instanceSet] of prunedI.entries()) {
    const features = templateFeatureMap.get(templateXPath) || {};

    for (const instXPath of instanceSet) {
        const instEl = elByXPathOrCSS(instXPath);
        if (!instEl) continue;

        const parentEl = instEl.parentElement || instEl;

        if (_pxHoverBound.has(parentEl)) continue;
        _pxHoverBound.add(parentEl);

        // Highlight (same as before)
        parentEl.style.outline = "10px solid red";
        parentEl.style.outlineOffset = "0px";
        parentEl.style.backgroundColor = "rgba(255, 255, 0, 0.3)";

        parentEl.addEventListener("mouseenter", () => {
            console.group("[PX] Template Hover Info");
            console.log("Template XPath:", templateXPath);
            console.log("Instance XPath:", instXPath);
            console.log("Element:", parentEl);
            console.log("Features:", features);
            console.groupEnd();
        });
    }
}
