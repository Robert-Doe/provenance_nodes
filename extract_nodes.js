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
