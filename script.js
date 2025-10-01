document.addEventListener('DOMContentLoaded', () => {
    // ############### הגדרות קבועות ###############
    const DAY_DURATION_MINUTES = 24 * 60; // 1440 דקות
    const DAY_DURATION_HOURS = 24; 
    // טווח הקלט הוגדר כעת ב-HTML SELECT, אך אנו שומרים את הערכים המקסימליים לשם ולידציית חישוב
    const MIN_SHIFT_HOURS = 2; 
    const MAX_SHIFT_HOURS = 8;
    const DEFAULT_SHIFT_HOURS = 4;

    // ############### מערכי נתונים ###############
    // יאכלסו מ-Local Storage או יישארו ריקים
    let soldiers = []; 
    let posts = [];
    let mandatoryAssignments = []; 
    
    // משתנים דינמיים
    let SHIFT_DURATION_MINUTES = DEFAULT_SHIFT_HOURS * 60; 
    let MIN_REST_DURATION_MINUTES = DEFAULT_SHIFT_HOURS * 60; 

    // ############### אלמנטים ###############
    const shiftDurationInput = document.getElementById('shift-duration-input');
    const autoCalculateBtn = document.getElementById('auto-calculate-btn');
    const shiftDurationNote = document.getElementById('shift-duration-note');
    const soldierNameInput = document.getElementById('soldier-name-input');
    const addSoldierBtn = document.getElementById('add-soldier-btn');
    const soldiersList = document.getElementById('soldiers-list');
    const postNameInput = document.getElementById('post-name-input');
    const postGuardsInput = document.getElementById('post-guards-input');
    const addPostBtn = document.getElementById('add-post-btn');
    const postsList = document.getElementById('posts-list');
    
    // אלמנטים לשיבוץ חובה
    const mandatorySoldierSelect = document.getElementById('mandatory-soldier-select');
    const mandatoryPostSelect = document.getElementById('mandatory-post-select');
    const addMandatoryAssignmentBtn = document.getElementById('add-mandatory-assignment-btn');
    const mandatoryAssignmentsList = document.getElementById('mandatory-assignments-list');

    const generateBtn = document.getElementById('generate-schedule-btn');
    const scheduleGrid = document.querySelector('.schedule-grid');
    const summaryOutput = document.getElementById('summary-output');
    const summarySection = document.getElementById('summary-section');
    const scheduleSection = document.getElementById('schedule-section');
    
    // אלמנטים להעתקה וייצוא
    const copyScheduleBtn = document.getElementById('copy-schedule-btn');
    const exportImageBtn = document.getElementById('export-image-btn');
    

    
    // ############### פונקציות שמירה וטעינה (Local Storage) ###############
    
    function saveData() {
        // שומר את הנתונים ב-Local Storage
        localStorage.setItem('soldiers', JSON.stringify(soldiers));
        localStorage.setItem('posts', JSON.stringify(posts));
        localStorage.setItem('mandatoryAssignments', JSON.stringify(mandatoryAssignments));
        localStorage.setItem('shiftDurationHours', shiftDurationInput.value);
    }
    
    function loadData() {
        const savedSoldiers = localStorage.getItem('soldiers');
        const savedPosts = localStorage.getItem('posts');
        const savedAssignments = localStorage.getItem('mandatoryAssignments');
        const savedShiftDuration = localStorage.getItem('shiftDurationHours');

        if (savedSoldiers) {
            try {
                const parsedSoldiers = JSON.parse(savedSoldiers);
                if (Array.isArray(parsedSoldiers)) soldiers = parsedSoldiers;
            } catch (e) { /* ignore */ }
        }
        if (savedPosts) {
            try {
                const parsedPosts = JSON.parse(savedPosts);
                if (Array.isArray(parsedPosts)) posts = parsedPosts;
            } catch (e) { /* ignore */ }
        }
        if (savedAssignments) {
            try {
                const parsedAssignments = JSON.parse(savedAssignments);
                if (Array.isArray(parsedAssignments)) mandatoryAssignments = parsedAssignments;
            } catch (e) { /* ignore */ }
        }
        if (savedShiftDuration) {
            // טעינת הערך ל-SELECT (אם קיים)
            const option = shiftDurationInput.querySelector(`option[value="${savedShiftDuration}"]`);
            if (option) {
                shiftDurationInput.value = savedShiftDuration;
            }
        }
        
        // קריאה לפונקציות הרינדור לאחר הטעינה
        renderSoldiers();
        renderPosts();
        renderMandatoryAssignments();
        
        // עדכון משך המשמרת והמשתנים הגלובליים
        updateShiftDuration(false); 
        updateGenerateButton();
    }

    // ############### 1. טיפול בקלט משך משמרת (דינמי) ###############
    
    function updateShiftDuration(shouldSave = true) { 
        // הקלט כעת מגיע משדה <select>, אין צורך בוולידציית טווח אגרסיבית
        let hours = parseInt(shiftDurationInput.value, 10);
        
        // אם הערך לא חוקי משום מה, נחזיר לברירת מחדל, אבל בדרך כלל ה-select מונע זאת
        if (isNaN(hours) || hours < MIN_SHIFT_HOURS || hours > 9) {
            hours = DEFAULT_SHIFT_HOURS;
            shiftDurationInput.value = DEFAULT_SHIFT_HOURS;
        }

        // הגדרת משתנים
        SHIFT_DURATION_MINUTES = hours * 60;
        MIN_REST_DURATION_MINUTES = hours * 60;
        
        shiftDurationNote.innerHTML = `זמן מנוחה מינימלי בין שמירות יוגדר אוטומטית להיות: <strong>${hours} שעות</strong>.`;
        
        autoCalculateBtn.textContent = 'חשב זמן אידיאלי';
        autoCalculateBtn.style.backgroundColor = '#6c757d'; 
        
        if (shouldSave) {
            saveData(); // שמירה
        }

        updateGenerateButton(); 
    }

    // ############### פונקציה לחישוב זמן אידיאלי ###############
    function calculateIdealShiftDuration() {
        if (soldiers.length === 0 || posts.length === 0) {
            alert("יש להוסיף חיילים ועמדות לפני חישוב זמן אידיאלי.");
            return;
        }

        const totalGuardsNeeded = posts.reduce((sum, p) => sum + p.guards, 0);
        const numSoldiers = soldiers.length;
        
        const totalGuardHours = DAY_DURATION_HOURS * totalGuardsNeeded;
        const idealGuardTimePerSoldier = totalGuardHours / numSoldiers;
        
        let bestShiftHours = DEFAULT_SHIFT_HOURS;
        let minDeviation = Infinity;
        let perfectMatch = false;

        // סריקה בטווח 2-8 שעות (או עד 9 כפי שנתת אופציה, למרות ש-8 נפוץ יותר)
        for (let h = MIN_SHIFT_HOURS; h <= 8; h++) {
            if (DAY_DURATION_HOURS % h === 0) {
                
                const numShiftsPerDay = DAY_DURATION_HOURS / h;
                const totalShifts = numShiftsPerDay * totalGuardsNeeded;
                const shiftsPerSoldier = totalShifts / numSoldiers;
                const totalGuardTimeWithH = shiftsPerSoldier * h;
                
                // בדיקה לשוויון מוחלט (מספר המשמרות לחייל צריך להיות שלם)
                const isShiftsPerSoldierWhole = Math.abs(shiftsPerSoldier - Math.round(shiftsPerSoldier)) < 0.001;

                if (isShiftsPerSoldierWhole) {
                    if (Math.abs(totalGuardTimeWithH - idealGuardTimePerSoldier) < 0.001) {
                         bestShiftHours = h;
                         perfectMatch = true;
                         break; 
                    }
                }
                
                const deviation = Math.abs(totalGuardTimeWithH - idealGuardTimePerSoldier);
                
                if (deviation < minDeviation) {
                    minDeviation = deviation;
                    bestShiftHours = h;
                }
            }
        }
        
        shiftDurationInput.value = bestShiftHours;
        updateShiftDuration(); // קריאה שתכלול שמירה
        
        // עדכון ההודעה
        let message = `נבחר: ${bestShiftHours} שעות`;
        if (perfectMatch) {
            message += ' (שוויון מוחלט מובטח!)';
        } else {
            message += ' (החלוקה השוויונית ביותר האפשרית)';
        }
        
        autoCalculateBtn.textContent = message;
        autoCalculateBtn.style.backgroundColor = '#17a2b8'; 
        setTimeout(() => {
            autoCalculateBtn.textContent = 'חשב זמן אידיאלי';
            autoCalculateBtn.style.backgroundColor = '#6c757d';
        }, 5000);
    }
    
    // שימוש במאזין 'change' בלבד כיוון שמדובר ב-select
    shiftDurationInput.addEventListener('change', () => updateShiftDuration(true));
    autoCalculateBtn.addEventListener('click', calculateIdealShiftDuration);
    
    // ############### פונקציות עזר כלליות ###############

    function updateGenerateButton() {
        const totalGuardsNeeded = posts.reduce((sum, post) => sum + post.guards, 0);

        if (soldiers.length === 0 || posts.length === 0) {
            generateBtn.disabled = true;
            generateBtn.textContent = 'הוסף חיילים ועמדות כדי להתחיל';
            generateBtn.style.backgroundColor = '#adb5bd';
        } else if (totalGuardsNeeded > soldiers.length) {
             generateBtn.disabled = true;
             generateBtn.textContent = `דרושים ${totalGuardsNeeded} שומרים, יש רק ${soldiers.length}. אין אפשרות לבצע סידור!`;
             generateBtn.style.backgroundColor = '#dc3545';
        } else {
            generateBtn.disabled = false;
            generateBtn.textContent = `צור סידור שמירה (${soldiers.length} חיילים | ${posts.length} עמדות) - משך: ${SHIFT_DURATION_MINUTES / 60} שעות`;
            generateBtn.style.backgroundColor = '#ffc107';
        }
    }

    function formatTime(minutes) {
        const h = Math.floor(minutes / 60).toString().padStart(2, '0');
        const m = (minutes % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    // ############### 2. ניהול חיילים ###############

    function renderSoldiers() {
        soldiersList.innerHTML = '';
        soldiers.forEach(soldier => {
            const li = document.createElement('li');
            li.innerHTML = `${soldier} <button class="remove-btn" data-name="${soldier}">❌</button>`;
            soldiersList.appendChild(li);
        });
        updateMandatoryAssignmentSelectors();
    }
    
    function addSoldier() {
        const name = soldierNameInput.value.trim();
        if (name && !soldiers.includes(name)) {
            soldiers.push(name);
            renderSoldiers();
            soldierNameInput.value = '';
            updateGenerateButton();
            soldierNameInput.focus(); 
            saveData(); // שמירה
        }
    }

    addSoldierBtn.addEventListener('click', addSoldier);

    // הוספת אירוע Enter לחייל
    soldierNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addSoldier();
            e.preventDefault();
        }
    });


    soldiersList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn') && !e.target.dataset.type) {
            const nameToRemove = e.target.dataset.name;
            soldiers = soldiers.filter(s => s !== nameToRemove);
            // הסרת שיבוצי חובה קשורים
            mandatoryAssignments = mandatoryAssignments.filter(a => a.soldier !== nameToRemove);
            renderMandatoryAssignments(); 
            renderSoldiers();
            updateGenerateButton();
            saveData(); // שמירה
        }
    });
    
    // ############### 3. ניהול עמדות ###############

    function renderPosts() {
        postsList.innerHTML = '';
        posts.forEach((post, index) => {
            const li = document.createElement('li');
            li.innerHTML = `${post.name} (${post.guards} שומרים) <button class="remove-post-btn" data-index="${index}">❌</button>`;
            postsList.appendChild(li);
        });
        updateMandatoryAssignmentSelectors();
    }

    function addPost() {
        const name = postNameInput.value.trim();
        const guards = parseInt(postGuardsInput.value, 10);

        if (name && guards > 0) {
            posts.push({ name, guards });
            renderPosts();
            postNameInput.value = '';
            postGuardsInput.value = 1;
            updateGenerateButton();
            postNameInput.focus(); 
            saveData(); // שמירה
        }
    }

    addPostBtn.addEventListener('click', addPost);
    
    // הוספת אירועי Enter לעמדה
    postNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            postGuardsInput.focus(); 
            e.preventDefault();
        }
    });

    postGuardsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addPost(); 
            e.preventDefault();
        }
    });
    
    postsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-post-btn')) {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            const postName = posts[indexToRemove]?.name; 
            posts.splice(indexToRemove, 1);
            
            // הסרת שיבוצי חובה קשורים
            mandatoryAssignments = mandatoryAssignments.filter(a => a.post !== postName);
            renderMandatoryAssignments();
            renderPosts();
            updateGenerateButton();
            saveData(); // שמירה
        }
    });

    // ############### 4. ניהול שיבוצי חובה ###############

    function updateMandatoryAssignmentSelectors() {
        // מילוי רשימת חיילים
        mandatorySoldierSelect.innerHTML = '<option value="" disabled selected>בחר חייל</option>';
        soldiers.forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s;
            mandatorySoldierSelect.appendChild(option);
        });

        // מילוי רשימת עמדות
        mandatoryPostSelect.innerHTML = '<option value="" disabled selected>בחר עמדה</option>';
        posts.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            option.textContent = p.name;
            mandatoryPostSelect.appendChild(option);
        });

        // הפעלת כפתור רק אם יש גם חיילים וגם עמדות
        const canAdd = soldiers.length > 0 && posts.length > 0;
        addMandatoryAssignmentBtn.disabled = !canAdd;
        addMandatoryAssignmentBtn.textContent = canAdd ? 'הוסף שיבוץ חובה' : 'הוסף חיילים/עמדות';
    }

    function renderMandatoryAssignments() {
        mandatoryAssignmentsList.innerHTML = '';
        mandatoryAssignments.forEach((assignment, index) => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${assignment.soldier}</strong> ➡️ ${assignment.post} <button class="remove-btn" data-index="${index}" data-type="mandatory">❌</button>`;
            mandatoryAssignmentsList.appendChild(li);
        });
    }

    function addMandatoryAssignment() {
        const soldier = mandatorySoldierSelect.value;
        const post = mandatoryPostSelect.value;

        if (soldier && post) {
            // בדיקה שלא קיים כבר
            const exists = mandatoryAssignments.some(a => a.soldier === soldier && a.post === post);
            if (!exists) {
                mandatoryAssignments.push({ soldier, post });
                renderMandatoryAssignments();
                // איפוס בחירה
                mandatorySoldierSelect.value = '';
                mandatoryPostSelect.value = '';
                mandatorySoldierSelect.focus();
                saveData(); // שמירה
            } 
        }
    }
    
    addMandatoryAssignmentBtn.addEventListener('click', addMandatoryAssignment);

    mandatoryAssignmentsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn') && e.target.dataset.type === 'mandatory') {
            const indexToRemove = parseInt(e.target.dataset.index, 10);
            mandatoryAssignments.splice(indexToRemove, 1);
            renderMandatoryAssignments();
            saveData(); // שמירה
        }
    });


    // ############### 5. לוגיקת יצירת הסידור ###############

    generateBtn.addEventListener('click', generateSchedule);

    function generateSchedule() {
        if (soldiers.length === 0 || posts.length === 0 || generateBtn.disabled) return;

        const currentShiftDuration = SHIFT_DURATION_MINUTES;
        const currentRestDuration = MIN_REST_DURATION_MINUTES;
        
        const fullSchedule = [];
        let time = 0;
        
        const soldierLastEndTimes = {};
        soldiers.forEach(s => soldierLastEndTimes[s] = -currentRestDuration); 
        
        const soldierGuardHours = {};
        soldiers.forEach(s => soldierGuardHours[s] = 0); 
        
        
        while (time < DAY_DURATION_MINUTES) {
            const shiftEnd = Math.min(time + currentShiftDuration, DAY_DURATION_MINUTES);
            
            if (shiftEnd <= time) break;

            const actualShiftDurationMinutes = shiftEnd - time;
            const actualShiftHours = actualShiftDurationMinutes / 60;
            
            const shift = {
                timeStart: time,
                timeEnd: shiftEnd,
                postAssignments: {}
            };
            
            const assignedInThisShift = new Set();
            let currentPostAssignments = {};
            posts.forEach(p => currentPostAssignments[p.name] = []);
            
            let requiredSlots = [];
            posts.forEach(post => {
                for (let i = 0; i < post.guards; i++) {
                    requiredSlots.push(post.name);
                }
            });

            requiredSlots.forEach(postName => {
                let bestSoldier = null;
                let lowestHours = Infinity;
                
                // שלב 1: מציאת חיילים זמינים כרגע (פנויים ולא שומרים במשמרת זו)
                const availableSoldiers = soldiers.filter(soldier => 
                    !assignedInThisShift.has(soldier) && 
                    !(time < soldierLastEndTimes[soldier] + currentRestDuration)
                );
                
                // שלב 2: בדיקה לשיבוץ חובה (עדיפות עליונה)
                const mandatorySoldiersForPost = mandatoryAssignments
                    .filter(a => a.post === postName)
                    .map(a => a.soldier);

                let bestMandatorySoldier = null;
                let lowestMandatoryHours = Infinity;

                // בדיקה בתוך החיילים הזמינים: מי חייל חובה לעמדה זו ועם הכי מעט שעות סה"כ?
                availableSoldiers
                    .filter(s => mandatorySoldiersForPost.includes(s))
                    .forEach(soldier => {
                        const currentHours = soldierGuardHours[soldier];
                        if (currentHours < lowestMandatoryHours) {
                            lowestMandatoryHours = currentHours;
                            bestMandatorySoldier = soldier;
                        } 
                    });

                if (bestMandatorySoldier) {
                    // עדיפות ראשונה: שיבוץ חייל חובה.
                    bestSoldier = bestMandatorySoldier; 
                } else {
                    // עדיפות שנייה (כאשר אין חייל חובה פנוי):
                    // בחירת החייל הזמין עם סך השעות הנמוך ביותר (כולל חיילי חובה פנויים ורגילים).
                    availableSoldiers.forEach(soldier => {
                        const currentHours = soldierGuardHours[soldier];
                        if (currentHours < lowestHours) {
                            lowestHours = currentHours;
                            bestSoldier = soldier;
                        } 
                    });
                }
                
                // שיבוץ החייל שנבחר (אם יש)
                if (bestSoldier) {
                    currentPostAssignments[postName].push(bestSoldier);
                    assignedInThisShift.add(bestSoldier);
                    
                    soldierLastEndTimes[bestSoldier] = shiftEnd;
                    soldierGuardHours[bestSoldier] += actualShiftHours; 

                } else {
                    currentPostAssignments[postName].push("אין חייל");
                }
            });

            shift.postAssignments = currentPostAssignments;
            fullSchedule.push(shift);
            time = shiftEnd;
        }
        
        displaySummary(fullSchedule);
        displaySchedule(fullSchedule);
    }

    // ############### 6. הצגת סיכום וסידור מפורט ###############
    
    function displaySummary(fullSchedule) {
        
        const currentRestDuration = MIN_REST_DURATION_MINUTES;
        
        const soldierStats = {};
        soldiers.forEach(s => {
            soldierStats[s] = { TOTAL: 0 };
            posts.forEach(p => soldierStats[s][p.name] = 0);
        });

        fullSchedule.forEach(shift => {
            const actualShiftHours = (shift.timeEnd - shift.timeStart) / 60;
            
            Object.keys(shift.postAssignments).forEach(postName => {
                shift.postAssignments[postName].forEach(soldier => {
                    if (soldier !== "אין חייל") {
                        soldierStats[soldier][postName] += actualShiftHours;
                        soldierStats[soldier].TOTAL += actualShiftHours;
                    }
                });
            });
        });

        summaryOutput.innerHTML = '';
        summarySection.style.display = 'block';
        
        const totalGuardsNeeded = posts.reduce((sum, p) => sum + p.guards, 0);
        const totalGuardHours = (DAY_DURATION_HOURS) * totalGuardsNeeded;
        const totalGuardTimePerSoldier = totalGuardHours > 0 ? totalGuardHours / soldiers.length : 0;
        
        const idealTimeHeader = document.createElement('p');
        idealTimeHeader.style.fontWeight = 'bold';
        idealTimeHeader.style.fontSize = '1.1em';
        idealTimeHeader.style.color = '#007bff';
        idealTimeHeader.innerHTML = `זמן שמירה אידיאלי לחייל: <strong>${totalGuardTimePerSoldier.toFixed(2)} שעות</strong> | זמן מנוחה אידיאלי: <strong>${(DAY_DURATION_HOURS - totalGuardTimePerSoldier).toFixed(2)} שעות</strong> (מינימום מנוחה רצופה: ${currentRestDuration / 60} שעות)`;
        summaryOutput.appendChild(idealTimeHeader);

        const ul = document.createElement('ul');
        soldiers.forEach(soldier => {
            const guardTime = soldierStats[soldier].TOTAL;
            const restTime = DAY_DURATION_HOURS - guardTime;
            const deviation = guardTime - totalGuardTimePerSoldier;
            
            let deviationText = '';
            let deviationColor = '';
            
            // בדיקה מדויקת של סטייה (סטייה מקסימלית של עד 0.05 שעה = 3 דקות)
            if (Math.abs(deviation) < 0.05) { 
                deviationText = '✔️ חלוקה שווה (סטייה זניחה)';
                deviationColor = 'green';
            } else if (deviation > 0.05) {
                deviationText = `⚠️ שומר יותר ב- ${deviation.toFixed(2)} שעות מהממוצע.`;
                deviationColor = 'red';
            } else { 
                deviationText = `⚠️ שומר פחות ב- ${Math.abs(deviation).toFixed(2)} שעות מהממוצע.`;
                deviationColor = 'orange';
            }

            let postDetails = posts.map(p => {
                return `${p.name}: ${soldierStats[soldier][p.name].toFixed(1)} שעות`;
            }).join(' | ');


            const li = document.createElement('li');
            li.innerHTML = `
                <strong>${soldier}:</strong> 
                <ul>
                    <li><strong>סך שמירה:</strong> ${guardTime.toFixed(2)} שעות | <strong>סך מנוחה:</strong> ${restTime.toFixed(2)} שעות</li>
                    <li style="color: ${deviationColor}; font-weight: bold; margin-top: 5px;">${deviationText}</li>
                    <li>**חלוקה לפי עמדות:** ${postDetails}</li>
                </ul>
            `;
            ul.appendChild(li);
        });
        summaryOutput.appendChild(ul);
    }


    function displaySchedule(fullSchedule) {
        scheduleGrid.innerHTML = '';
        scheduleSection.style.display = 'block';

        const header = document.createElement('div');
        header.classList.add('schedule-header');
        header.innerHTML = `
            <div class="schedule-cell">שעה</div>
            ${posts.map(p => `<div class="schedule-cell">${p.name} (${p.guards})</div>`).join('')}
        `;
        scheduleGrid.appendChild(header);
        
        scheduleGrid.style.gridTemplateColumns = `1fr repeat(${posts.length}, 1fr)`;

        fullSchedule.forEach(shift => {
            const row = document.createElement('div');
            row.classList.add('schedule-row');
            
            const timeCell = document.createElement('div');
            timeCell.classList.add('schedule-cell', 'time-cell');
            timeCell.textContent = `${formatTime(shift.timeStart)} - ${formatTime(shift.timeEnd)}`;
            row.appendChild(timeCell);

            posts.forEach(post => {
                const cell = document.createElement('div');
                cell.classList.add('schedule-cell', 'guard-cell');
                const assignedGuards = shift.postAssignments[post.name];
                
                cell.innerHTML = assignedGuards.map(s => {
                    if (s === "אין חייל") {
                        return `<span style="background-color: #ffdddd; color: #cc0000; font-weight: bold;">אין חייל</span>`;
                    }
                    return `<span>${s}</span>`;
                }).join('<br>');
                
                row.appendChild(cell);
            });
            
            scheduleGrid.appendChild(row);
        });
    }
    
    // ############### 7. פונקציית העתקת הטבלה (העתקת טקסט - נשמר כאופציה משנית) ###############
    
    function copyScheduleTable() {
        const grid = document.querySelector('.schedule-grid');
        if (!grid || !grid.children.length) {
            alert('אין סידור שמירה לייצוא.');
            return;
        }

        let textContent = '';
        const numCols = posts.length + 1; // שעה + מספר עמדות
        
        // איסוף כל התאים לפי הסדר המוצג ב-DOM
        const allCells = Array.from(grid.querySelectorAll('.schedule-cell'));
        
        if (allCells.length === 0) {
            alert('לא נמצאו נתונים בטבלת הסידור.');
            return;
        }

        // בניית הטקסט המועתק בצורה טבלאית
        for (let i = 0; i < allCells.length; i++) {
            const cell = allCells[i];
            
            let cellText;
            if (cell.classList.contains('guard-cell')) {
                // עבור תא שומרים: קח את כל תוכני ה-<span> והפרד בפסיק ורווח
                cellText = Array.from(cell.querySelectorAll('span')).map(span => span.textContent.trim()).join(', ');
            } else {
                // עבור תא שעה או כותרת: טקסט רגיל
                cellText = cell.textContent.trim();
            }
            
            textContent += cellText;

            const cellIndexInRow = i % numCols;

            if (cellIndexInRow === numCols - 1) {
                // סוף שורה (העמודה האחרונה)
                textContent += '\n';
            } else {
                // אמצע שורה
                textContent += '\t';
            }
        }

        // העתקה ללוח
        navigator.clipboard.writeText(textContent).then(() => {
            copyScheduleBtn.textContent = '✔️ הועתק בהצלחה!';
            copyScheduleBtn.style.backgroundColor = '#28a745';
            setTimeout(() => {
                copyScheduleBtn.textContent = 'העתק טבלה (טקסט)';
                copyScheduleBtn.style.backgroundColor = '#007bff';
            }, 3000);
        }).catch(err => {
            console.error('Copy failed: ', err);
            alert('העתקת טקסט נכשלה. נסה שוב או השתמש ב"ייצוא כתמונה".');
        });
    }
    
    // ############### 8. פונקציית ייצוא תמונה (השיטה האמינה) ###############

    function exportScheduleAsImage() {
        if (typeof html2canvas === 'undefined') {
             alert('הספרייה ליצירת תמונה לא נטענה. אנא רענן את העמוד.');
             return;
        }

        const scheduleGrid = document.querySelector('.schedule-grid');
        if (!scheduleGrid) {
            alert('אין סידור שמירה לייצוא.');
            return;
        }

        exportImageBtn.textContent = 'יוצר תמונה...';
        exportImageBtn.disabled = true;

        // שימוש בספריית html2canvas
        html2canvas(scheduleGrid, {
            // הגדרות להבטחת איכות טובה
            scale: 2, 
            backgroundColor: '#ffffff', 
            logging: false
        }).then(canvas => {
            // המרת ה-Canvas ל-Data URL (PNG)
            const imageURL = canvas.toDataURL('image/png'); 
            
            // יצירת לינק הורדה
            const link = document.createElement('a');
            link.href = imageURL;
            link.download = 'Schedule_Table.png'; // שם הקובץ שיירד

            // הפעלת לחיצה אוטומטית להורדה
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // עדכון ה-UI
            exportImageBtn.textContent = '✔️ הורד בהצלחה!';
            exportImageBtn.style.backgroundColor = '#28a745';
            
            setTimeout(() => {
                exportImageBtn.textContent = 'ייצוא כתמונה (PNG) 🖼️';
                exportImageBtn.style.backgroundColor = '#6f42c1';
                exportImageBtn.disabled = false;
            }, 3000);
        }).catch(err => {
            console.error('Image export failed:', err);
            alert('ייצוא תמונה נכשל. ודא שהטבלה מוצגת כראוי.');
            
            exportImageBtn.textContent = 'ייצוא כתמונה נכשל';
            exportImageBtn.style.backgroundColor = '#dc3545';
            exportImageBtn.disabled = false;
        });
    }

    copyScheduleBtn.addEventListener('click', copyScheduleTable);
    exportImageBtn.addEventListener('click', exportScheduleAsImage); 


    // ############### אתחול - טעינת נתונים ###############
    loadData();
});