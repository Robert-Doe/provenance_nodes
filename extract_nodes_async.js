(async () => {
    // ---------- Tunables (optional) ----------
    const MAX_NODES = 0;           // 0 = all elements
    const CHILD_CLASS_CAP = 10;    // cap for child_class_tokens in child_shape (0 = no cap)



    function isInShadowRoot(el) {
        return !!el.getRootNode && el.getRootNode() instanceof ShadowRoot;
    }

    function getShadowHost(el) {
        const root = el.getRootNode && el.getRootNode();
        return root instanceof ShadowRoot ? root.host : null;
    }



    // ---------- Small utils ----------
    const enc = new TextEncoder();
    const hex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

    async function sha1Hex(s)  { return hex(await crypto.subtle.digest("SHA-1", enc.encode(s))); }
    async function sha256Hex(s){ return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }

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

    function collectAllElementsDeep(rootNode) {
        const out = [];
        const visited = new Set();

        function walk(node) {
            if (!node || visited.has(node)) return;
            visited.add(node);

            if (node.nodeType === Node.ELEMENT_NODE) {
                out.push(node);

                // If this element hosts an open shadow root, walk into it
                const sr = node.shadowRoot;
                if (sr) {
                    walk(sr);  // shadowRoot itself is a DocumentFragment
                }
            }

            // Walk light DOM children
            const children = node.children || [];
            for (let i = 0; i < children.length; i++) {
                walk(children[i]);
            }
        }

        // Start from <html>, not document
        walk(rootNode.documentElement || rootNode);
        return out;
    }

/*// Use this instead of querySelectorAll("*")
    const allEls = collectAllElementsDeep(document);
    const cappedEls = (MAX_NODES && MAX_NODES > 0) ? allEls.slice(0, MAX_NODES) : allEls;
    const elToIndex = new Map(cappedEls.map((el, i) => [el, i]));*/




    // Gather neutral facts for every element
    const allEls = Array.from(document.querySelectorAll("*"));
    const cappedEls = (MAX_NODES && MAX_NODES > 0) ? allEls.slice(0, MAX_NODES) : allEls;
    const elToIndex = new Map(cappedEls.map((el, i) => [el, i]));

    const raw_nodes = cappedEls.map((el, idx) => {
        const classes = (el.className && typeof el.className === "string") ? el.className.trim().split(/\s+/) : [];
        const dataKeys = [];
        const ariaKeys = [];
        let roleVal = el.getAttribute("role");


        // --- NEW: shadow DOM info ---
        /*const root = el.getRootNode && el.getRootNode();
        const in_shadow_root = root instanceof ShadowRoot;
        const shadow_host = in_shadow_root && root.host ? root.host : null;
        const shadow_host_xpath = shadow_host ? getAbsoluteXPath(shadow_host) : null;*/

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
            outer_html_len: (el.outerHTML || "").length,
            // --- NEW fields on raw_nodes ---
            //in_shadow_root,
            //shadow_host_xpath
        };
    });

    // ---------- Document IDs ----------
    const normalizedUrl = normalizeUrl(location.href);
    const html = document.documentElement.outerHTML || "";
    const html_checksum = await sha1Hex(html);
    const doc_id = `px:v2:doc:${await sha1Hex(normalizedUrl + '|' + html_checksum)}`;

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
            //classes_norm,
            attr_keys,
            child_shape: {
                child_tags_present,
                child_tag_bins,
                //child_class_tokens
            }
        };
        const sig_json = canonicalJSON(sig_struct);
        const sig_id = `px:v2:sig:${await sha1Hex(sig_json)}`;
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
        const content_anchor = content_anchor_seed ? `txt16:${await sha1Hex(content_anchor_seed)}` : null;

        const node_id_raw = canonicalJSON({
            doc: doc_id,
            sigpath,
            rank_among_same_sig: rank,
            content_anchor,
        });
        const node_id = `px:v2:node:${await sha1Hex(node_id_raw)}`;

        const crypto_id = `px:v2:crypto:${await sha256Hex(doc_id + '|' + n.xpath)}`;

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
                child_tag_hist: n.child_tag_hist
            },
            locators: {
                xpath: n.xpath,
                css_path: n.css_path,
                sigpath
            },
           // in_shadow_root: n.in_shadow_root,
            //shadow_host_xpath: n.shadow_host_xpath,
            sibling: {
                rank_among_same_sig: rank,
                siblings_same_sig_total: same_total
            },
            content_anchor,
            children_ids: [],// fill later
            /*in_shadow_root,
            shadow_host_xpath: shadow_host ? getAbsoluteXPath(shadow_host) : null,*/
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
    // e.g. console.table(__px_last_scan.records.slice(0,10).map(r => ({sig:r.sig_id, node:r.node_id, depth:r.signals.depth, xpath:r.locators.xpath})));

    return result;
})();
