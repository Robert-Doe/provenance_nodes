// === Highlight FINAL templates in prunedI ===
// Applies background + 10px red border to the direct parent of each instance

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
