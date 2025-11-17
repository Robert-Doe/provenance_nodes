/**
 * Detect metadata inside a candidate element.
 * Returns { has_author, has_avatar, has_timestamp }
 *
 * - has_author: element that looks like a username/author
 * - has_avatar: image/avatar element
 * - has_timestamp: time/age information
 */

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
