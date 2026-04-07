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

    // ─── CV text parser ───
    function parseCVText(text) {
        var info = {};
        var clean = text.replace(/\s+/g, " ").trim();
        var lines = text.split(/\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });

        // Name — first plausible line in top 5
        for (var i = 0; i < Math.min(lines.length, 5); i++) {
            var line = lines[i].trim();
            if (/^(curriculum|resume|cv|profile|contact|personal|about)/i.test(line)) continue;
            if (/@/.test(line) || /^[\d+\-()\s]{10,}/.test(line) || /^https?:\/\//i.test(line)) continue;
            var words = line.split(/\s+/);
            if (words.length >= 2 && words.length <= 5 && /^[A-Za-z.\-'\s]+$/.test(line) && line.length <= 60) {
                info.fullName = line; break;
            }
        }

        // Phone (Indian mobile)
        var phoneM = clean.match(/(?:(?:\+91|91|0)?[\s\-.]?)?[6-9]\d{4}[\s\-.]?\d{5}/);
        if (phoneM) info.phone = phoneM[0].replace(/[\s\-.\(\)]/g, "").replace(/^(\+?91|0)/, "");

        // LinkedIn
        var liM = clean.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?/i);
        if (liM) { var u = liM[0]; if (!/^https?:\/\//i.test(u)) u = "https://" + u; info.linkedin = u; }

        // PAN
        var panM = clean.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
        if (panM) info.pan = panM[0];

        // Location (common Indian + GCC cities)
        var cities = ["Mumbai","Delhi","Bengaluru","Bangalore","Hyderabad","Chennai","Kolkata","Pune","Ahmedabad","Jaipur","Lucknow","Surat","Nagpur","Indore","Thane","Bhopal","Vadodara","Gurgaon","Gurugram","Noida","Navi Mumbai","Kochi","Chandigarh","Coimbatore","New Delhi","Dubai","Abu Dhabi","Riyadh","Jeddah","Doha","Muscat"];
        for (var ci = 0; ci < cities.length; ci++) {
            if (new RegExp("\\b" + cities[ci].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(clean)) {
                info.location = cities[ci]; break;
            }
        }

        // Company
        var compM = clean.match(/(?:current(?:ly)?[\s:]+(?:working\s+(?:at|with|in|for))?|(?:present\s+)?employer|working\s+(?:at|with|for)|employed\s+(?:at|with|by))[\s:]*([A-Z][A-Za-z0-9&\s,.\-']+?)(?:\s*(?:as|since|\||-|\n|$))/i);
        if (compM && compM[1] && compM[1].trim().length > 1 && compM[1].trim().length < 80) info.company = compM[1].trim().replace(/[,.\s]+$/, "");

        // Designation
        var desM = clean.match(/(?:designation|position|role|title|current\s+role)[\s:]+([A-Za-z\s\-&\/,()]+?)(?:\s*(?:at|in|\||-|\n|$))/i);
        if (desM && desM[1] && desM[1].trim().length > 2 && desM[1].trim().length < 60) info.designation = desM[1].trim().replace(/[,.\s]+$/, "");

        // Experience
        var expM = clean.match(/(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)[\s\-]*(?:of\s+)?(?:total\s+)?(?:experience|exp)/i);
        if (!expM) expM = clean.match(/(?:total\s+)?(?:experience|exp)[\s:]+(\d{1,2}(?:\.\d)?)\+?\s*(?:years?|yrs?)/i);
        if (expM && expM[1]) { var y = parseFloat(expM[1]); if (y >= 0 && y <= 50) info.experience = y; }

        // CTC
        var ctcM = clean.match(/(?:current\s+)?(?:ctc|salary|compensation|package)[\s:]*(?:Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?\s*(?:per\s*annum)?)/i);
        if (ctcM && ctcM[1]) { var v = parseFloat(ctcM[1]); if (v > 0 && v < 500) info.currentCTC = v; }

        // Expected CTC
        var ectcM = clean.match(/(?:expected|desired|target)\s*(?:ctc|salary|compensation|package)[\s:]*(?:Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(?:lpa|lakhs?\s*(?:per\s*annum)?)/i);
        if (ectcM && ectcM[1]) { var ev = parseFloat(ectcM[1]); if (ev > 0 && ev < 500) info.expectedCTC = ev; }

        // Notice Period
        var npM = clean.match(/(?:notice\s*period)[\s:]*(\d+)\s*(?:days?)/i);
        if (npM && npM[1]) info.noticePeriodDays = parseInt(npM[1]);
        if (/(?:notice\s*period)[\s:]*(?:immediate)/i.test(clean)) info.noticePeriodDays = 0;

        // Qualification
        var quals = [["phd","PhD"],["doctorate","PhD"],["mba","MBA"],["master","Master's"],["mtech","Master's"],["msc","Master's"],["bachelor","Bachelor's"],["btech","Bachelor's"],["bsc","Bachelor's"],["bcom","Bachelor's"],["diploma","Diploma"]];
        for (var qi = 0; qi < quals.length; qi++) {
            if (new RegExp("\\b" + quals[qi][0] + "\\b", "i").test(clean)) { info.qualification = quals[qi][1]; break; }
        }

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
    //  Hooks into: input[name="resume"] in #jobSeekerForm Step 3
    // ═══════════════════════════════════════════
    function initJobSeekerAutoExtract() {
        var form = document.getElementById("jobSeekerForm");
        if (!form) return; // Not on this page

        var resumeInput = form.querySelector('input[name="resume"]');
        if (!resumeInput) return;

        var statusEl = createStatusDiv(resumeInput);

        resumeInput.addEventListener("change", function() {
            var file = this.files && this.files[0];
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
        });
    }

    // ═══════════════════════════════════════════
    //  FORM B: Candidate Referral (candidate-referral.html)
    //  Hooks into: #cvFile input
    // ═══════════════════════════════════════════
    function initReferralAutoExtract() {
        var cvInput = document.getElementById("cvFile");
        if (!cvInput) return; // Not on this page

        var statusEl = createStatusDiv(cvInput);

        cvInput.addEventListener("change", function() {
            var file = this.files && this.files[0];
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
                // Qualification (select dropdown)
                if (info.qualification) {
                    var qSelect = document.getElementById("qualification");
                    if (qSelect && !qSelect.value) { qSelect.value = info.qualification; filled++; }
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
        });
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
