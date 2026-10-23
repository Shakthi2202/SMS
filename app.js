/* ============================================
   Campus Connect — app.js
   Core shared logic: toasts, course data, enrollment & progress.
   Plain script (no import/export) — load this BEFORE auth.js
   and before any page-specific script, e.g.:
     <script src="app.js"></script>
     <script src="auth.js"></script>
   ============================================ */

/* ---------- Toast notifications ---------- */

function ensureToastStack(){
    let stack = document.getElementById("toast-stack");
    if(!stack){
        stack = document.createElement("div");
        stack.id = "toast-stack";
        document.body.appendChild(stack);
    }
    return stack;
}

function showToast(message, type, duration){
    type = type || "info";
    duration = duration || 3200;

    const icons = { success:"✓", error:"!", info:"i" };
    const stack = ensureToastStack();

    const toast = document.createElement("div");
    toast.className = "toast " + type;
    const icon = document.createElement("strong");
    icon.textContent = icons[type] || "i";
    const text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(icon);
    toast.appendChild(text);

    stack.appendChild(toast);

    setTimeout(function(){
        toast.classList.add("hide");
        setTimeout(function(){ toast.remove(); }, 250);
    }, duration);
}

/* ---------- Active nav highlighting ---------- */

document.addEventListener("DOMContentLoaded", function(){
    const current = location.pathname.split("/").pop() || "Home.html";
    document.querySelectorAll(".nav").forEach(function(link){
        const href = link.getAttribute("href");
        if(href && href.toLowerCase() === current.toLowerCase()){
            link.classList.add("active");
        }
    });
});

/* ---------- Course catalog (JSON format) ---------- */

const COURSE_CATALOG_KEY = "campusConnectCourseCatalog";
const COURSES_PAGE_SIZE = 24;
let COURSES = JSON.parse(localStorage.getItem(COURSE_CATALOG_KEY) || "[]");

async function fetchCourseCatalog(start){
    let result = null;

    // 1. Try server endpoint (/api/courses.v1)
    try{
        const url = new URL("/api/courses.v1", location.origin);
        url.searchParams.set("limit", String(COURSES_PAGE_SIZE));
        if(start){
            url.searchParams.set("start", String(start));
        }
        const response = await fetch(url.toString());
        if(response.ok){
            result = await response.json();
        }
    }catch(err){
        console.warn("Could not reach /api/courses.v1, attempting direct courses.json load:", err);
    }

    // 2. Direct static courses.json fallback
    if(!result){
        try{
            const response = await fetch("courses.json");
            if(response.ok){
                const list = await response.json();
                result = {
                    elements: Array.isArray(list) ? list : (list.elements || []),
                    paging: { next: null, total: Array.isArray(list) ? list.length : (list.elements || []).length }
                };
            }
        }catch(err){
            console.error("Direct fetch of courses.json failed:", err);
        }
    }

    if(!result || !Array.isArray(result.elements)){
        throw new Error("Unable to load course catalog data.");
    }

    const courses = result.elements.filter(function(course){
        return course && course.id && course.name;
    });

    const knownIds = new Set(COURSES.map(function(c){ return c.id; }));
    const newCourses = courses.filter(function(c){ return !knownIds.has(c.id); });
    COURSES = COURSES.concat(newCourses);
    localStorage.setItem(COURSE_CATALOG_KEY, JSON.stringify(COURSES));

    return {
        courses: courses,
        next: result.paging && result.paging.next ? result.paging.next : null,
        total: result.paging && Number.isFinite(result.paging.total) ? result.paging.total : COURSES.length
    };
}

// Backward-compatible alias for existing callers
const fetchCourseraCourses = fetchCourseCatalog;

function courseUrl(course){
    if(course && course.url){
        return course.url;
    }
    if(course && course.slug){
        return "https://www.coursera.org/learn/" + encodeURIComponent(course.slug);
    }
    return "#";
}

/* ---------- Enrollment & progress storage ---------- */

function getEnrolledCourses(){
    return JSON.parse(localStorage.getItem("courses")) || [];
}

function saveEnrolledCourses(list){
    localStorage.setItem("courses", JSON.stringify(list));
}

function isEnrolled(courseName){
    return getEnrolledCourses().includes(courseName);
}

function enroll(courseName, displayName){
    const courses = getEnrolledCourses();

    if(courses.includes(courseName)){
        showToast((displayName || courseName) + " — you're already enrolled.", "info");
        return false;
    }

    courses.push(courseName);
    saveEnrolledCourses(courses);
    showToast("Enrolled in " + (displayName || courseName) + "!", "success");
    return true;
}

function getAllProgress(){
    return JSON.parse(localStorage.getItem("progress")) || {};
}

function getCourseProgress(courseName){
    const all = getAllProgress();
    return all[courseName] || [];
}

function toggleStep(courseName, stepIndex){
    if(!isEnrolled(courseName)){
        showToast("Enroll in " + courseName + " to track your progress.", "info");
        return;
    }

    const all = getAllProgress();
    const done = all[courseName] || [];
    const pos = done.indexOf(stepIndex);

    if(pos === -1){
        done.push(stepIndex);
        showToast("Marked complete — nice progress!", "success");
    }else{
        done.splice(pos, 1);
    }

    all[courseName] = done;
    localStorage.setItem("progress", JSON.stringify(all));
}

function courseProgressPercent(courseName, totalSteps){
    const done = getCourseProgress(courseName);
    if(!totalSteps) return 0;
    return Math.round((done.length / totalSteps) * 100);
}

/* ---------- Course helper chat ---------- */

function setupCourseChatbot(){
    const launcher = document.createElement("button");
    launcher.className = "chat-launcher";
    launcher.type = "button";
    launcher.textContent = "Chat with Course Helper";
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "course-chat");

    const panel = document.createElement("section");
    panel.className = "chat-panel";
    panel.id = "course-chat";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Course Helper chat");
    panel.innerHTML = `
        <div class="chat-header">
            <div><strong>Course Helper</strong><span>Ask me about courses</span></div>
            <button class="chat-close" type="button" aria-label="Close chat">×</button>
        </div>
        <div class="chat-messages" role="log" aria-live="polite"></div>
        <form class="chat-form">
            <label class="sr-only" for="chat-input">Your message</label>
            <input id="chat-input" name="message" type="text" placeholder="Try “courses about design”" autocomplete="off" required>
            <button type="submit">Send</button>
        </form>`;
    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    const messages = panel.querySelector(".chat-messages");
    const form = panel.querySelector(".chat-form");
    const input = panel.querySelector("#chat-input");

    function addMessage(text, author, courses){
        const message = document.createElement("div");
        message.className = "chat-message " + author;
        const copy = document.createElement("p");
        copy.textContent = text;
        message.appendChild(copy);

        (courses || []).forEach(function(course){
            const link = document.createElement("a");
            link.href = courseUrl(course);
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = course.name;
            message.appendChild(link);
        });

        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
    }

    async function findCourses(question){
        const stopWords = new Set(["about", "can", "course", "courses", "do", "find", "for", "have", "help", "learn", "learning", "looking", "please", "recommend", "show", "some", "the", "what", "with", "you"]);
        const terms = (question.toLowerCase().match(/[a-z0-9]+/g) || []).filter(function(term){
            return term.length > 2 && !stopWords.has(term);
        });
        if(terms.length === 0){
            return COURSES.slice(0, 3);
        }

        function rankCourses(){
            const phrase = question.toLowerCase().trim();
            return COURSES.map(function(course){
                const title = course.name.toLowerCase();
                const description = (course.description || "").toLowerCase();
                const score = terms.reduce(function(total, term){
                    return total + (title.includes(term) ? 3 : 0) + (description.includes(term) ? 1 : 0);
                }, title.includes(phrase) ? 100 : 0);
                return { course: course, score: score };
            }).filter(item => item.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(item => item.course);
        }

        let matches = rankCourses();
        let next = COURSES.length;
        let pagesFetched = 0;
        while(matches.length === 0 && pagesFetched < 3){
            const lastPage = await fetchCourseraCourses(next);
            next = lastPage.next;
            pagesFetched += 1;
            matches = rankCourses();
            if(!next){
                break;
            }
        }
        return matches;
    }

    launcher.addEventListener("click", function(){
        panel.hidden = !panel.hidden;
        launcher.setAttribute("aria-expanded", String(!panel.hidden));
        if(!panel.hidden){
            input.focus();
        }
    });
    panel.querySelector(".chat-close").addEventListener("click", function(){
        panel.hidden = true;
        launcher.setAttribute("aria-expanded", "false");
        launcher.focus();
    });
    addMessage("Hi! I can help you find courses. Ask about a subject, like programming, design, AI, or data.", "bot");

    form.addEventListener("submit", async function(event){
        event.preventDefault();
        const question = input.value.trim();
        if(!question){
            return;
        }
        addMessage(question, "user");
        input.value = "";
        input.disabled = true;

        try{
            const normalizedQuestion = question.toLowerCase();
            if(/\b(hi|hello|hey)\b/.test(normalizedQuestion)){
                addMessage("Hello! Tell me a subject you want to learn, or ask me to recommend courses.", "bot");
                return;
            }
            if(/\b(help|what can you do)\b/.test(normalizedQuestion)){
                addMessage("I can search courses by topic and enroll you in the best match. Try “Python courses” or “enroll me in a design course.”", "bot");
                return;
            }
            if(/\b(enrolled|enrollment status)\b/.test(normalizedQuestion)){
                const count = getEnrolledCourses().length;
                addMessage("You are enrolled in " + count + " course" + (count === 1 ? "" : "s") + ". Your full list is on the Dashboard.", "bot");
                return;
            }
            const matches = await findCourses(question);
            if(matches.length){
                if(/\benroll\b/.test(normalizedQuestion)){
                    const course = matches[0];
                    const wasEnrolled = isEnrolled(course.id);
                    enroll(course.id, course.name);
                    addMessage((wasEnrolled ? "You’re already enrolled in " : "You’re now enrolled in ") + course.name + ".", "bot", [course]);
                }else{
                    addMessage("Here are a few courses that match:", "bot", matches);
                }
            }else{
                addMessage("I couldn't find a match in the catalog pages I checked. Try a broader topic or browse the Courses page.", "bot");
            }
        }catch(error){
            console.error("Course Helper could not search the Coursera catalog:", error);
            addMessage("I couldn't reach the course catalog just now. Please try again in a moment.", "bot");
        }finally{
            input.disabled = false;
            input.focus();
        }
    });
}

document.addEventListener("DOMContentLoaded", setupCourseChatbot);
