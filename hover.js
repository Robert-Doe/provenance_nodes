
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
