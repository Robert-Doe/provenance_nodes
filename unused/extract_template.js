(() => {
    // ===== Params (same as before) =====
    const MIN_K = 3;
    const MAX_PER_INSTANCE = 2;
    const ONLY_OUTER_TEMPLATES = 1;
    const MIN_SLOT_DEPTH = 4;
    const MIN_SLOT_INSTANCES_WITH_CHILDREN = 1;

    const KEYWORDS = [
        "comment","comments","reply","replies",
        "post","thread","discussion","message"
    ];

    const BORDER_STYLE = "10px solid red";   // visual highlight style
    const OUTLINE_OFFSET = "2px";

    // ===== Input guard =====
    const scan = window.__px_last_scan;
    if (!scan || !Array.isArray(scan.records)) {
        throw new Error("[PX] Missing __px_last_scan.records. Run the first scan script on this page first.");
    }
    const nodes = scan.records;

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

    const filterDepth = (m,e,x2n,minDepth,minKids)=>{
        const ki=new Map(), ke=new Map();
        for (const [t,s] of m.entries()) {
            if (!s.size) continue;
            const one = s.values().next().value;
            const depth = xpath_steps(one).length;
            if (depth < minDepth) continue;
            let withKids = 0;
            for (const x of s) {
                const arr = x2n.get(x) || [];
                if (arr.some(n => n.children_ids?.length > 0)) withKids++;
            }
            if (withKids < minKids) continue;
            ki.set(t, s);
            ke.set(t, (e.get(t) || []).slice());
        }
        return {instances:ki, examples:ke};
    };
    ({instances:prunedI, examples:prunedE} =
        filterDepth(prunedI, prunedE, xpath_to_nodes, MIN_SLOT_DEPTH, MIN_SLOT_INSTANCES_WITH_CHILDREN));

    // ===== Intent filter =====
    const raw_nodes = Array.isArray(scan.raw_nodes) ? scan.raw_nodes : [];
    const xpath_to_css = new Map(raw_nodes.map(r => [r.xpath, r.css_path]));

    const kwSet = new Set(KEYWORDS.map(k => k.toLowerCase()));
    const attrContains = (n,v)=>{
        const s = (String(n)+" "+String(v)).toLowerCase();
        for (const k of kwSet) if (s.includes(k)) return true;
        return false;
    };
    const textRegex = new RegExp(`\\b(${Array.from(kwSet).map(k=>k.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')).join("|")})\\b`,"i");

    const elByXPath = xp => {
        try {
            return document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } catch { return null; }
    };
    const elByXPathOrCSS = xp => {
        let e = elByXPath(xp);
        if (e) return e;
        const css = xpath_to_css.get(xp);
        if (css) { try { e = document.querySelector(css); } catch {} }
        return e || null;
    };

    const subtreeMatch = el => {
        if (!el) return false;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null);
        let node = walker.currentNode;
        while (node) {
            if (node.nodeType === 1) {
                for (const a of node.attributes || []) {
                    if (attrContains(a.name, a.value)) return true;
                }
                if (attrContains("class", node.className) || attrContains("id", node.id)) return true;
                const t = node.getAttribute?.("aria-label") || node.getAttribute?.("title") || node.getAttribute?.("placeholder");
                if (attrContains("misc", t)) return true;
            } else if (node.nodeType === 3) {
                if (textRegex.test(node.nodeValue || "")) return true;
            }
            node = walker.nextNode();
        }
        return false;
    };

    // Gather matched instances (as before)
    const intentInstances = new Map();   // template -> Set(slot instance xpaths that matched)
    for (const [tmpl, instanceSet] of prunedI.entries()) {
        const matched = new Set();
        for (const instXPath of instanceSet) {
            const el = elByXPathOrCSS(instXPath);
            if (el && subtreeMatch(el)) matched.add(instXPath);
        }
        if (matched.size) intentInstances.set(tmpl, matched);
    }

    // ===== NEW: Highlight PARENT of each matched slot instance =====
    // We track the parent elements so we can also download them as images later.
    const matchedParentElements = [];   // array of { element, fromInstanceXPath, parentXPath }
    const parentSeen = new WeakSet();   // dedupe DOM elements

    const parentXPathOf = (xp) => {
        const steps = xpath_steps(xp);
        steps.pop(); // drop the last step (/.../div[*] -> /... parent)
        return join_from_steps(steps);
    };

    let highlightedCount = 0;
    for (const matched of intentInstances.values()) {
        for (const instXp of matched) {
            // Prefer DOM parent from the resolved element; fall back to computing parent XPath if needed.
            const instEl = elByXPathOrCSS(instXp);
            let parentEl = instEl ? instEl.parentElement : null;
            let parentXp = null;

            if (!parentEl) {
                parentXp = parentXPathOf(instXp);
                parentEl = elByXPathOrCSS(parentXp);
            } else {
                // We can still compute the parent XPath for transparency
                parentXp = parentXPathOf(instXp);
            }

            if (parentEl && !parentSeen.has(parentEl)) {
                parentSeen.add(parentEl);
                parentEl.style.outline = BORDER_STYLE;
                parentEl.style.outlineOffset = OUTLINE_OFFSET;
                matchedParentElements.push({ element: parentEl, fromInstanceXPath: instXp, parentXPath: parentXp });
                highlightedCount++;
            }
        }
    }

    // ===== Build final output (unchanged fields + info) =====
    const templates = [];
    for (const [t, matched] of intentInstances.entries()) {
        const all = Array.from(prunedI.get(t) || []);
        const one = all[0];
        const depth = xpath_steps(one).length;
        let withKids=0;
        for (const x of all) {
            const arr = xpath_to_nodes.get(x) || [];
            if (arr.some(n => n.children_ids?.length > 0)) withKids++;
        }
        templates.push({
            block_xpath_template: t,
            distinct_block_instances: all.length,
            example_concrete_block_xpaths: (prunedE.get(t) || []).slice(0,5),
            slot_depth: depth,
            slot_instances_with_children: withKids,
            matched_instances_for_intent: matched.size
        });
    }
    templates.sort((a,b)=> b.matched_instances_for_intent - a.matched_instances_for_intent
        || b.distinct_block_instances - a.distinct_block_instances);

    const out = {
        params: {
            min_k: MIN_K,
            max_per_instance: MAX_PER_INSTANCE,
            only_outer_templates: ONLY_OUTER_TEMPLATES,
            min_slot_depth: MIN_SLOT_DEPTH,
            min_slot_instances_with_children: MIN_SLOT_INSTANCES_WITH_CHILDREN,
            intent_keywords: KEYWORDS.slice()
        },
        parents: parents_summary,
        block_templates: templates
    };

    window.__px_block_candidates = out;
    window.__px_matched_parent_elements = matchedParentElements;

    console.log(`[PX] Matching templates: ${templates.length}`);
    console.log(`[PX] Highlighted parent elements: ${highlightedCount}`);
    console.log(`[PX] Results in window.__px_block_candidates; parents for download in window.__px_matched_parent_elements`);

    // ===== On-demand downloader: saves each highlighted parent as PNG =====
    // Usage: await __px_download_parent_matches({ scale: 2 })
    window.__px_download_parent_matches = async function downloadParents(opts = {}) {
        const scale = Number.isFinite(opts.scale) ? opts.scale : 2;

        async function loadScript(src) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.async = true;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }

        // Try to ensure html2canvas is available
        if (!(window.html2canvas)) {
            try {
                await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
            } catch (e) {
                console.warn("[PX] html2canvas CDN failed, trying unpkg fallback…", e);
                try {
                    await loadScript("https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js");
                } catch (e2) {
                    console.error("[PX] Unable to load html2canvas. CSP/CDN blocked?");
                    throw e2;
                }
            }
        }

        const list = window.__px_matched_parent_elements || [];
        if (!list.length) {
            console.warn("[PX] No matched parent elements to download.");
            return;
        }

        let i = 0;
        for (const item of list) {
            const el = item.element;
            if (!el) continue;
            try {
                const canvas = await window.html2canvas(el, {
                    scale,
                    useCORS: true,
                    backgroundColor: null, // keep transparent background if possible
                    scrollX: 0,
                    scrollY: 0
                });
                const dataURL = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = dataURL;
                a.download = `px-parent-${String(++i).padStart(3, "0")}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } catch (err) {
                console.error("[PX] Failed to render an element with html2canvas:", err, el);
            }
        }
        console.log(`[PX] Attempted to download ${i} parent element image(s).`);
    };

    return out;
})();
