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