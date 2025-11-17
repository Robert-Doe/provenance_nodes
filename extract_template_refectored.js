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
const a_dominates_b_keep_outer = (a, b) => {
    const A = split_template(a);
    const B = split_template(b);

    if (A.wi === -1 || B.wi === -1) return false;

    // A must be strictly shorter (higher in the hierarchy)
    if (A.steps.length >= B.steps.length) return false;

    // All steps of A must match the prefix of B,
    // except that A's wildcard step just needs to match the tag.
    for (let i = 0; i < A.steps.length; i++) {
        const as = A.steps[i];
        const bs = B.steps[i];

        if (i === A.wi) {
            // wildcard step in A: match by tag only
            if (step_tag(as) !== step_tag(bs)) return false;
        } else {
            if (as !== bs) return false;
        }
    }

    return true; // A is an outer template whose slot is an ancestor of B's slot
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

const prune = (m, e, onlyOuter) => {
    if (!onlyOuter) return { instances: m, examples: e };

    const t = Array.from(m.keys());
    const keep = new Map(t.map(x => [x, true]));

    for (let i = 0; i < t.length; i++) {
        for (let j = 0; j < t.length; j++) {
            if (i === j) continue;
            const A = t[i], B = t[j];
            if (!keep.get(A) || !keep.get(B)) continue;

            // If A is an outer template that structurally contains B's slot,
            // drop B.
            if (a_dominates_b_keep_outer(A, B)) {
                keep.set(B, false);
            }
        }
    }

    const outI = new Map(), outE = new Map();
    for (const name of t) if (keep.get(name)) {
        outI.set(name, m.get(name));
        outE.set(name, e.get(name) || []);
    }
    return { instances: outI, examples: outE };
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

//Comment Existed here until breakdown




// === After filterDepth: build a feature map for each template ===

// We need a helper to go from XPath -> DOM element, using the scan's raw_nodes
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

// Example: inspect one template's features in the console
// const someTemplate = Array.from(templateFeatureMap.keys())[0];
// console.log(someTemplate, templateFeatureMap.get(someTemplate));

