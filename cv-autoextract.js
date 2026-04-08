/**
 * CV Auto-Extract Feature for GCCPROs
 * Parses PDF/DOCX CVs client-side and auto-fills form fields.
 *
 * This file is completely self-contained and isolated.
 * If it fails for any reason, it will not affect any other page functionality.
 *
 * Usage:
 *   <script src="cv-autoextract.js" defer></script>
 *
 * For opportunities.html (Job Seeker form):
 *   Hooks into the existing resume file input in Step 3.
 *   Auto-fills fields in Step 1 and Step 2 when a CV is uploaded.
 *
 * For candidate-referral.html (Referral form):
 *   Hooks into the cvFile input.
 *   Auto-fills candidate fields when a CV is uploaded.
 */
(function() {
    "use strict";
    try {

    // ─── Library loader ───
    function loadScript(src) {
        return new Promise(function(resolve, reject) {
            var existing = document.querySelector('script[src="' + src + '"]');
            if (existing) { resolve(); return; }
            var s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            s.onerror = function() { reject(new Error("Failed to load " + src)); };
            document.head.appendChild(s);
        });
    }

    // ─── Status display ───
    function showStatus(el, type, msg) {
        if (!el) return;
        var styles = {
            parsing: "background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;",
            success: "background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;",
            warn: "background:#fefce8;border:1px solid #fde68a;color:#92400e;",
            info: "background:#f8f9fa;border:1px solid #e5e7eb;color:#374151;"
        };
        el.style.cssText = "display:flex;margin-top:0.5rem;padding:0.6rem 0.9rem;border-radius:8px;font-size:0.82rem;align-items:center;gap:0.5rem;" + (styles[type] || styles.info);
        el.textContent = msg;
    }

    function createStatusDiv(afterEl) {
        if (!afterEl || !afterEl.parentNode) return null;
        var div = document.createElement("div");
        div.style.cssText = "display:none;margin-top:0.5rem;padding:0.6rem 0.9rem;border-radius:8px;font-size:0.82rem;align-items:center;gap:0.5rem;";
        afterEl.parentNode.insertBefore(div, afterEl.nextSibling);
        return div;
    }

    // ─── CV text parser (robust) ───
    function parseCVText(text) {
        var info = {};
        var clean = text.replace(/\s+/g, " ").trim();
        var lines = text.split(/\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });

        // ── Name — first plausible line in top 8 lines ──
        for (var i = 0; i < Math.min(lines.length, 8); i++) {
            var line = lines[i].trim();
            if (/^(curriculum|resume|cv\b|profile|contact|personal|about|summary|objective|address|page)/i.test(line)) continue;
            if (/@/.test(line) || /^[\d+\-()\s]{10,}/.test(line) || /^https?:\/\//i.test(line)) continue;
            if (/linkedin|github|phone|mobile|email|tel|fax/i.test(line)) continue;
            var words = line.split(/\s+/);
            if (words.length >= 2 && words.length <= 6 && /^[A-Za-z.\-'\s]+$/.test(line) && line.length >= 4 && line.length <= 60) {
                info.fullName = line; break;
            }
        }

        // ── Phone (Indian mobile — flexible patterns) ──
        var phonePatterns = [
            /(?:\+91[\s\-.]?)?[6-9]\d{4}[\s\-.]?\d{5}/,
            /(?:91[\s\-.])?[6-9]\d{4}[\s\-.]?\d{5}/,
            /(?:phone|mobile|cell|contact|tel)[\s:]*(?:\+?91[\s\-.]?)?([6-9]\d{4}[\s\-.]?\d{5})/i,
            /[6-9]\d{9}/
        ];
        for (var pi = 0; pi < phonePatterns.length; pi++) {
            var phoneM = clean.match(phonePatterns[pi]);
            if (phoneM) {
                var raw = (phoneM[1] || phoneM[0]).replace(/[\s\-.\(\)]/g, "");
                raw = raw.replace(/^(\+?91|0)/, "");
                if (raw.length === 10 && /^[6-9]/.test(raw)) { info.phone = raw; break; }
            }
        }

        // ── Email (for reference, not typically auto-filled) ──
        var emailM = clean.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        if (emailM) info.email = emailM[0].toLowerCase();

        // ── LinkedIn ──
        var liM = clean.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?/i);
        if (liM) { var u = liM[0]; if (!/^https?:\/\//i.test(u)) u = "https://" + u; info.linkedin = u; }

        // ── PAN ──
        var panM = clean.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
        if (panM) info.pan = panM[0];

        // ── Location (expanded Indian cities + GCC cities) ──
        var cities = [
            "Mumbai","Delhi","Bengaluru","Bangalore","Hyderabad","Chennai","Kolkata","Pune",
            "Ahmedabad","Jaipur","Lucknow","Surat","Nagpur","Indore","Thane","Bhopal",
            "Vadodara","Gurgaon","Gurugram","Noida","Navi Mumbai","Kochi","Chandigarh",
            "Coimbatore","New Delhi","Greater Noida","Ghaziabad","Faridabad","Mysuru","Mysore",
            "Mangalore","Mangaluru","Trivandrum","Thiruvananthapuram","Visakhapatnam","Vizag",
            "Patna","Ranchi","Bhubaneswar","Dehradun","Agra","Varanasi","Nashik","Rajkot",
            "Tiruchirappalli","Trichy","Madurai","Salem","Vijayawada","Guntur","Warangal",
            "Hubli","Belgaum","Belagavi","Aurangabad","Jodhpur","Raipur","Amritsar",
            "Dubai","Abu Dhabi","Riyadh","Jeddah","Doha","Muscat","Kuwait","Sharjah","Bahrain"
        ];
        for (var ci = 0; ci < cities.length; ci++) {
            if (new RegExp("\\b" + cities[ci].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(clean)) {
                info.location = cities[ci]; break;
            }
        }

        // ── Company — multiple patterns ──
        var compPatterns = [
            /(?:current(?:ly)?[\s:]+(?:working\s+(?:at|with|in|for))?|(?:present\s+)?employer|working\s+(?:at|with|for)|employed\s+(?:at|with|by))[\s:]*([A-Z][A-Za-z0-9&\s,.\-']+?)(?:\s*(?:as|since|\||-|\n|,|$))/i,
            /(?:company|organization|organisation|firm)[\s:]+([A-Z][A-Za-z0-9&\s,.\-']+?)(?:\s*(?:\||-|\n|,|$))/i,
            /(?:^|\n)\s*([A-Z][A-Za-z0-9&.\s]+?(?:Technologies|Solutions|Consulting|Services|Systems|Software|Infosys|Wipro|TCS|Cognizant|Accenture|Capgemini|Tech Mahindra|HCL|LTIMindtree|Deloitte|KPMG|EY|PwC|IBM|Oracle|Microsoft|Google|Amazon|Flipkart))\b/i
        ];
        for (var cpi = 0; cpi < compPatterns.length; cpi++) {
            var compM = clean.match(compPatterns[cpi]);
            if (compM && compM[1] && compM[1].trim().length > 1 && compM[1].trim().length < 80) {
                info.company = compM[1].trim().replace(/[,.\s]+$/, "");
                break;
            }
        }

        // ── Designation — multiple patterns ──
        var desPatterns = [
            /(?:designation|position|role|job\s*title|current\s+role|current\s+designation)[\s:]+([A-Za-z\s\-&\/,().]+?)(?:\s*(?:at|in|\||-|\n|$))/i,
            /(?:^|\n)\s*((?:Senior|Junior|Lead|Principal|Staff|Chief|Head|Manager|Director|VP|Associate|Assistant|Analyst|Engineer|Developer|Architect|Consultant|Specialist|Coordinator|Executive|Administrator|Designer|Tester|QA|DevOps|Data|Full[\s\-]?Stack|Front[\s\-]?end|Back[\s\-]?end|Software|Product|Project|Program|Business|Technical|Marketing|Sales|HR|Finance|Operations)[\w\s\-&\/,()]*?)(?:\s+at\s+|\s+in\s+|\s*[\|,\-]\s*|\s*\n)/i
        ];
        for (var dpi = 0; dpi < desPatterns.length; dpi++) {
            var desM = clean.match(desPatterns[dpi]);
            if (desM && desM[1] && desM[1].trim().length > 2 && desM[1].trim().length < 60) {
                info.designation = desM[1].trim().replace(/[,.\s]+$/, "");
                break;
            }
        }

        // ── Experience — multiple patterns ──
        var expPatterns = [
            /(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)[\s\-]*(?:of\s+)?(?:total\s+)?(?:experience|exp)/i,
            /(?:total\s+)?(?:experience|exp)[\s:]*(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)/i,
            /(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)\s+(?:in\s+)?(?:it|software|development|industry|professional)/i,
            /(?:experience|exp)[\s:]*(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)/i,
            /(?:having|with)\s+(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)/i
        ];
        for (var epi = 0; epi < expPatterns.length; epi++) {
            var expM = clean.match(expPatterns[epi]);
            if (expM && expM[1]) {
                var y = parseFloat(expM[1]);
                if (y >= 0 && y <= 50) { info.experience = y; break; }
            }
        }

        // ── CTC — multiple patterns ──
        var ctcPatterns = [
            /(?:current\s+)?(?:ctc|salary|compensation|package|annual\s+salary)[\s:]*(?:Rs\.?|INR|₹)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?\s*(?:per\s*annum)?|l\.?p\.?a\.?)/i,
            /(?:ctc|salary)[\s:]*(?:Rs\.?|INR|₹)?\s*(\d+(?:\.\d+)?)\s*(?:lacs?|lac|lakh)/i,
            /(?:current\s+)?(?:ctc|salary)[\s:]*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac)/i
        ];
        for (var cti = 0; cti < ctcPatterns.length; cti++) {
            var ctcM = clean.match(ctcPatterns[cti]);
            if (ctcM && ctcM[1]) {
                var v = parseFloat(ctcM[1]);
                if (v > 0 && v < 500) { info.currentCTC = v; break; }
            }
        }

        // ── Expected CTC ──
        var ectcPatterns = [
            /(?:expected|desired|target|asking)\s*(?:ctc|salary|compensation|package)[\s:]*(?:Rs\.?|INR|₹)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?\s*(?:per\s*annum)?|l\.?p\.?a\.?|lacs?|lac|lakh)/i,
            /(?:expected|desired)\s*[:]\s*(?:Rs\.?|INR|₹)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac)/i
        ];
        for (var eci = 0; eci < ectcPatterns.length; eci++) {
            var ectcM = clean.match(ectcPatterns[eci]);
            if (ectcM && ectcM[1]) {
                var ev = parseFloat(ectcM[1]);
                if (ev > 0 && ev < 500) { info.expectedCTC = ev; break; }
            }
        }

        // ── Notice Period ──
        var npPatterns = [
            /(?:notice\s*period)[\s:]*(\d+)\s*(?:days?)/i,
            /(\d+)\s*(?:days?)\s*(?:notice)/i,
            /(?:notice\s*period)[\s:]*(\d+)\s*(?:months?)/i
        ];
        for (var npi = 0; npi < npPatterns.length; npi++) {
            var npM = clean.match(npPatterns[npi]);
            if (npM && npM[1]) {
                var npVal = parseInt(npM[1]);
                // If matched "months", convert to days
                if (/months?/i.test(npPatterns[npi].source)) npVal = npVal * 30;
                info.noticePeriodDays = npVal;
                break;
            }
        }
        if (info.noticePeriodDays === undefined && /(?:notice\s*period)[\s:]*(?:immediate|currently\s+serving|nil|zero|0\s*days?)/i.test(clean)) {
            info.noticePeriodDays = 0;
        }
        if (info.noticePeriodDays === undefined && /(?:immediately?\s+(?:available|joinable)|ready\s+to\s+join)/i.test(clean)) {
            info.noticePeriodDays = 0;
        }

        // ── Qualification — expanded list ──
        var quals = [
            ["ph\\.?d","PhD"],["doctorate","PhD"],
            ["m\\.?b\\.?a","MBA"],
            ["m\\.?tech","M.Tech/M.E."],["m\\.?e\\.(?!\\w)","M.Tech/M.E."],["master","M.Tech/M.E."],["m\\.?sc","M.Sc"],["m\\.?c\\.?a","MCA"],
            ["b\\.?tech","B.Tech/B.E."],["b\\.?e\\.(?!\\w)","B.Tech/B.E."],["bachelor","B.Tech/B.E."],["b\\.?sc","B.Sc"],["b\\.?c\\.?a","BCA"],["b\\.?com","B.Sc"],["b\\.?b\\.?a","BBA"],
            ["c\\.?a(?:\\s|$|,)","CA"],
            ["diploma","Diploma"]
        ];
        for (var qi = 0; qi < quals.length; qi++) {
            if (new RegExp("\\b" + quals[qi][0] + "\\b", "i").test(clean)) { info.qualification = quals[qi][1]; break; }
        }

        console.log("[CV AutoExtract] Parsed fields:", JSON.stringify(info));
        return info;
    }

    // ─── Extract text from file using PDF.js or Mammoth ───
    function extractTextFromFile(file) {
        var ext = file.name.split(".").pop().toLowerCase();
        if (ext !== "pdf" && ext !== "docx" && ext !== "doc") {
            return Promise.reject(new Error("Unsupported file type"));
        }

        var libUrl = (ext === "pdf")
            ? "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
            : "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
        var libReady = (ext === "pdf" && typeof pdfjsLib !== "undefined") || (ext !== "pdf" && typeof mammoth !== "undefined");

        var p = libReady ? Promise.resolve() : loadScript(libUrl);
        return p.then(function() {
            if (ext === "pdf") {
                pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                return file.arrayBuffer().then(function(buf) {
                    return pdfjsLib.getDocument({ data: buf }).promise;
                }).then(function(pdf) {
                    var text = "";
                    var chain = Promise.resolve();
                    for (var pg = 1; pg <= pdf.numPages; pg++) {
                        (function(pageNum) {
                            chain = chain.then(function() {
                                return pdf.getPage(pageNum);
                            }).then(function(page) {
                                return page.getTextContent();
                            }).then(function(content) {
                                text += content.items.map(function(it) { return it.str; }).join(" ") + "\n";
                            });
                        })(pg);
                    }
                    return chain.then(function() { return text; });
                });
            } else {
                return file.arrayBuffer().then(function(buf) {
                    return mammoth.extractRawText({ arrayBuffer: buf });
                }).then(function(result) { return result.value; });
            }
        });
    }

    // ─── Match qualification to dropdown value ───
    function matchQualification(selectEl, parsedQual) {
        if (!selectEl || !parsedQual || selectEl.value) return false;
        // Try exact match first
        selectEl.value = parsedQual;
        if (selectEl.value === parsedQual) return true;
        // Map common parser outputs to dropdown values
        var maps = {
            "B.Tech/B.E.": "Bachelor's", "BCA": "Bachelor's", "B.Sc": "Bachelor's", "BBA": "Bachelor's",
            "M.Tech/M.E.": "Master's", "MCA": "Master's", "M.Sc": "Master's",
            "MBA": "MBA", "PhD": "PhD", "Diploma": "Diploma", "CA": "Other",
            "Bachelor's": "Bachelor's", "Master's": "Master's"
        };
        var mapped = maps[parsedQual];
        if (mapped) { selectEl.value = mapped; return selectEl.value === mapped; }
        return false;
    }

    // ─── Generic set-if-empty helper ───
    function setIfEmpty(el, val) {
        if (!val) return false;
        if (!el) return false;
        if (el.value && el.value.trim()) return false;
        el.value = (typeof val === "number") ? val : val.trim();
        return true;
    }

    // ═══════════════════════════════════════════
    //  FORM A: Job Seeker Registration (opportunities.html)
    //  Hooks into: #jsCVAutoFill (Step 1) and input[name="resume"] (Step 3)
    // ═══════════════════════════════════════════
    function fillJobSeekerFromCV(form, statusEl, file) {
        if (!file) return;
        var ext = file.name.split(".").pop().toLowerCase();
        if (ext !== "pdf" && ext !== "docx" && ext !== "doc") return;

        showStatus(statusEl, "parsing", "Extracting details from your CV...");

        extractTextFromFile(file).then(function(text) {
            if (!text || text.trim().length < 30) {
                showStatus(statusEl, "warn", "Could not extract enough text from CV. Please fill in details manually.");
                return;
            }
            var info = parseCVText(text);
            var filled = 0;

            // Auto-fill Job Seeker form fields (only empty ones)
            if (setIfEmpty(form.querySelector('[name="fullName"]'), info.fullName)) filled++;
            if (setIfEmpty(form.querySelector('[name="phone"]'), info.phone)) filled++;
            if (setIfEmpty(form.querySelector('[name="linkedin"]'), info.linkedin)) filled++;
            if (setIfEmpty(form.querySelector('[name="currentCompany"]'), info.company)) filled++;
            if (setIfEmpty(form.querySelector('[name="currentDesignation"]'), info.designation)) filled++;
            if (setIfEmpty(form.querySelector('[name="currentLocation"]'), info.location)) filled++;
            if (setIfEmpty(form.querySelector('[name="totalExperience"]'), info.experience)) filled++;
            if (setIfEmpty(form.querySelector('[name="currentCTC"]'), info.currentCTC)) filled++;
            if (setIfEmpty(form.querySelector('[name="expectedCTC"]'), info.expectedCTC)) filled++;
            if (setIfEmpty(form.querySelector('[name="noticePeriod"]'), info.noticePeriodDays)) filled++;

            if (filled > 0) {
                showStatus(statusEl, "success", filled + " field" + (filled > 1 ? "s" : "") + " auto-filled from your CV. Please review for accuracy.");
            } else {
                showStatus(statusEl, "info", "CV parsed but no empty fields could be auto-filled.");
            }
        }).catch(function(err) {
            console.error("CV parse error:", err);
            showStatus(statusEl, "warn", "Could not parse CV automatically. Please fill in details manually.");
        });
    }

    function initJobSeekerAutoExtract() {
        var form = document.getElementById("jobSeekerForm");
        if (!form) return; // Not on this page

        // Hook 1: CV auto-fill input at the top of Step 1
        var cvAutoFill = document.getElementById("jsCVAutoFill");
        if (cvAutoFill) {
            var statusEl1 = createStatusDiv(cvAutoFill);
            cvAutoFill.addEventListener("change", function() {
                var file = this.files && this.files[0];
                fillJobSeekerFromCV(form, statusEl1, file);

                // Sync with Step 3: hide duplicate resume upload, show confirmation
                if (file) {
                    var step3Group = document.getElementById("jsStep3ResumeGroup");
                    var step3Confirm = document.getElementById("jsStep3ResumeUploaded");
                    var step3CVName = document.getElementById("jsStep3CVName");
                    if (step3Group) step3Group.style.display = "none";
                    if (step3Confirm) step3Confirm.style.display = "block";
                    if (step3CVName) step3CVName.textContent = file.name;

                    // Also copy the file to the resume input so form submission includes it
                    var resumeInput = form.querySelector('input[name="resume"]');
                    if (resumeInput) {
                        try {
                            var dt = new DataTransfer();
                            dt.items.add(file);
                            resumeInput.files = dt.files;
                        } catch(e) {
                            // DataTransfer not supported in older browsers — ignore
                        }
                    }
                }
            });
        }

        // Hook 2: Resume upload in Step 3 (also triggers auto-fill for any remaining empty fields)
        var resumeInput = form.querySelector('input[name="resume"]');
        if (resumeInput) {
            var statusEl2 = createStatusDiv(resumeInput);
            resumeInput.addEventListener("change", function() {
                fillJobSeekerFromCV(form, statusEl2, this.files && this.files[0]);
            });
        }
    }

    // ═══════════════════════════════════════════
    //  FORM B: Candidate Referral (candidate-referral.html)
    //  Hooks into: #cvFile input
    // ═══════════════════════════════════════════
    function fillReferralFromCV(statusEl, file) {
        if (!file) return;
        var ext = file.name.split(".").pop().toLowerCase();
        if (ext !== "pdf" && ext !== "docx" && ext !== "doc") return;

        showStatus(statusEl, "parsing", "Extracting details from your CV...");

        extractTextFromFile(file).then(function(text) {
            if (!text || text.trim().length < 30) {
                showStatus(statusEl, "warn", "Could not extract enough text from CV. Please fill in details manually.");
                return;
            }
            var info = parseCVText(text);
            var filled = 0;

            if (setIfEmpty(document.getElementById("candidateName"), info.fullName)) filled++;
            if (setIfEmpty(document.getElementById("phone"), info.phone)) filled++;
            if (setIfEmpty(document.getElementById("linkedin"), info.linkedin)) filled++;
            if (setIfEmpty(document.getElementById("company"), info.company)) filled++;
            if (setIfEmpty(document.getElementById("designation"), info.designation)) filled++;
            if (setIfEmpty(document.getElementById("experience"), info.experience)) filled++;
            if (setIfEmpty(document.getElementById("location"), info.location)) filled++;
            if (setIfEmpty(document.getElementById("ctc"), info.currentCTC)) filled++;
            if (setIfEmpty(document.getElementById("expectedCTC"), info.expectedCTC)) filled++;
            if (setIfEmpty(document.getElementById("panNumber"), info.pan)) filled++;

            // Notice period (select dropdown)
            if (info.noticePeriodDays !== undefined) {
                var npSelect = document.getElementById("noticePeriod");
                if (npSelect && !npSelect.value) {
                    var val = "";
                    if (info.noticePeriodDays === 0) val = "Immediate";
                    else if (info.noticePeriodDays <= 15) val = "15 days";
                    else if (info.noticePeriodDays <= 30) val = "30 days";
                    else if (info.noticePeriodDays <= 60) val = "60 days";
                    else if (info.noticePeriodDays <= 90) val = "90 days";
                    else val = "90+ days";
                    npSelect.value = val; filled++;
                }
            }
            // Qualification (select dropdown — use smart matching)
            if (info.qualification) {
                var qSelect = document.getElementById("qualification");
                if (matchQualification(qSelect, info.qualification)) filled++;
            }

            if (filled > 0) {
                showStatus(statusEl, "success", filled + " field" + (filled > 1 ? "s" : "") + " auto-filled from your CV. Please review for accuracy.");
            } else {
                showStatus(statusEl, "info", "CV parsed but no empty fields could be auto-filled.");
            }
        }).catch(function(err) {
            console.error("CV parse error:", err);
            showStatus(statusEl, "warn", "Could not parse CV automatically. Please fill in details manually.");
        });
    }

    function initReferralAutoExtract() {
        // Hook 1: CV auto-fill input at the top of the form
        var cvAutoFillRef = document.getElementById("cvAutoFillRef");
        if (cvAutoFillRef) {
            var statusEl1 = createStatusDiv(cvAutoFillRef);
            cvAutoFillRef.addEventListener("change", function() {
                fillReferralFromCV(statusEl1, this.files && this.files[0]);
            });
        }

        // Hook 2: Original cvFile input (also triggers auto-fill for remaining empty fields)
        var cvInput = document.getElementById("cvFile");
        if (cvInput) {
            var statusEl2 = createStatusDiv(cvInput);
            cvInput.addEventListener("change", function() {
                fillReferralFromCV(statusEl2, this.files && this.files[0]);
            });
        }

        // If neither input exists, we're not on this page
        if (!cvAutoFillRef && !cvInput) return;
    }

    // ─── Initialize on DOM ready ───
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function() {
            initJobSeekerAutoExtract();
            initReferralAutoExtract();
        });
    } else {
        initJobSeekerAutoExtract();
        initReferralAutoExtract();
    }

    } catch(e) {
        console.error("CV auto-extract init error:", e);
    }
})();
