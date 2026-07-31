// Configuration
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwU-nJJ30L4LKQmazH7dNsXzuvc4JfyetCZ-Q-BTDmTMlCjYZLPIoRGFtvI5tt3OmfP/exec';

// State
let state = {
    studentId: '',
    studentName: '',
    images: [],
    gradedProblem: null,
};
let problemData = {};
const PROGRESS_STORAGE_PREFIX = 'student_problem_progress_';
const ACHIEVEMENT_STORAGE_PREFIX = 'student_achievement_stars_';

// DOM Elements
const els = {
    appContent: document.querySelector('.app-content'),
    setupModal: document.getElementById('setup-modal'),
    studentIdInput: document.getElementById('student-id'),
    studentNameInput: document.getElementById('student-name'),
    problemPicker: document.getElementById('problem-picker'),
    problemAccordion: document.getElementById('problem-accordion'),
    problemSection: document.getElementById('problem-section'),
    roundSelect: document.getElementById('round-select'),
    problemSelect: document.getElementById('problem-select'),
    problemDisplay: document.getElementById('problem-display'),
    problemDisplayLabel: document.getElementById('problem-display-label'),
    problemDisplayImage: document.getElementById('problem-display-image'),
    problemDisplayMessage: document.getElementById('problem-display-message'),
    problemFitBtn: document.getElementById('problem-fit-btn'),
    startOtherTestBtn: document.getElementById('start-other-test-btn'),
    uraModeBanner: document.getElementById('ura-mode-banner'),
    achievementStars: document.getElementById('achievement-stars'),
    saveSetupBtn: document.getElementById('save-setup-btn'),
    userInfo: document.getElementById('user-info'),
    displayStudentId: document.getElementById('display-student-id'),
    settingsBtn: document.getElementById('settings-btn'),
    adminCheckBtn: document.getElementById('admin-check-btn'),

    cameraInput: document.getElementById('camera-input'),
    uploadBtn: document.getElementById('upload-btn'),
    previewContainer: document.getElementById('preview-container'),
    imagePreviewList: document.getElementById('image-preview-list'),
    addMoreBtn: document.getElementById('add-more-btn'),
    clearAllBtn: document.getElementById('clear-all-btn'),

    evaluateBtn: document.getElementById('evaluate-btn'),
    mismatchMessage: document.getElementById('mismatch-message'),
    loadingIndicator: document.getElementById('loading-indicator'),

    resultSection: document.getElementById('result-section'),
    resultBadge: document.getElementById('result-badge'),
    resultContent: document.getElementById('result-content'),
    toggleProblemBtn: document.getElementById('toggle-problem-btn'),
    gradedProblemDisplay: document.getElementById('graded-problem-display'),
    gradedProblemLabel: document.getElementById('graded-problem-label'),
    gradedProblemImage: document.getElementById('graded-problem-image'),
    gradedProblemMessage: document.getElementById('graded-problem-message'),
    gradedProblemFitBtn: document.getElementById('graded-problem-fit-btn'),
    screenshotBtn: document.getElementById('screenshot-btn'),
    newQuestionBtn: document.getElementById('new-question-btn'),

    cameraModal: document.getElementById('camera-modal'),
    cameraVideo: document.getElementById('camera-video'),
    cameraCanvas: document.getElementById('camera-canvas'),
    cameraShutterBtn: document.getElementById('camera-shutter-btn'),
    cameraSwitchBtn: document.getElementById('camera-switch-btn'),
    cameraCloseBtn: document.getElementById('camera-close-btn'),
};

let cameraState = {
    stream: null,
    facingMode: 'environment',
};

function init() {
    state.studentId = formatStudentId(localStorage.getItem('student_id') || '');
    state.studentName = localStorage.getItem('student_name') || '';

    if (state.studentId) localStorage.setItem('student_id', state.studentId);
    if (els.studentIdInput) els.studentIdInput.value = state.studentId;
    if (els.studentNameInput) els.studentNameInput.value = state.studentName;

    if (!state.studentId || !state.studentName) {
        els.setupModal.classList.remove('hidden');
    } else {
        updateUserInfo();
    }

    setupEventListeners();
    updateAdminCheckButton();
    fetchAndSetupProblems();
}

async function fetchAndSetupProblems() {
    els.roundSelect.innerHTML = '<option value="">-- データ読込中... --</option>';
    els.roundSelect.disabled = true;
    els.problemSelect.disabled = true;

    try {
        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'getProblems' }),
        });
        const json = await response.json();

        if (json.status !== 'success' || !json.data) {
            throw new Error(json.error || 'データ取得に失敗しました');
        }

        problemData = normalizeProblemData(json.data);
        renderProblemAccordion();
        els.roundSelect.innerHTML = '<option value="">-- 回を選択 --</option>';
        getRoundSelectKeys().forEach(round => {
            const opt = document.createElement('option');
            opt.value = round;
            opt.textContent = round;
            els.roundSelect.appendChild(opt);
        });
        els.roundSelect.disabled = false;
        setProblemPickerVisible(true);
    } catch (e) {
        console.error(e);
        els.roundSelect.innerHTML = '<option value="">-- ???? --</option>';
        if (els.problemAccordion) els.problemAccordion.innerHTML = `<div class="problem-accordion-empty">${escapeHtml(e.message || '?????????????????')}</div>`;
    }

}
function updateUserInfo() {
    if (!state.studentId || !state.studentName) return;
    updateAchievementStars();
    els.displayStudentId.textContent = state.studentId + ' / ' + state.studentName;
    els.userInfo.classList.remove('hidden');
    updateAdminCheckButton();
}

function formatStudentId(value) {
    const text = String(value || '').trim();
    if (/^\d{1,4}$/.test(text)) return text.padStart(4, '0');
    return text;
}
function isAdminMode() {
    const params = new URLSearchParams(window.location.search);
    const id = String(state.studentId || "").trim().toLowerCase();
    return params.get('admin') === '1' || ['admin', 'teacher', 'sensei', '管理者', '先生'].includes(id);
}

function updateAdminCheckButton() {
    if (!els.adminCheckBtn) return;
    els.adminCheckBtn.classList.toggle('hidden', !isAdminMode());
}

async function validateSpreadsheetFromAdminButton() {
    if (!isAdminMode()) return;

    const adminCode = window.prompt('管理者確認コードを入力してください。');
    if (!adminCode) return;

    const originalText = els.adminCheckBtn.textContent;
    els.adminCheckBtn.disabled = true;
    els.adminCheckBtn.textContent = '確認中';

    try {
        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action: 'validateSpreadsheet', adminCode }),
        });
        const json = await response.json();
        const validation = json.validation || {};
        const errors = validation.errors || [];
        const warnings = validation.warnings || [];

        if (json.status === 'success') {
            const message = [
                'チェックOKです。',
                `問題リスト: ${validation.problemSheetName || '一番左のシート'}`,
                `有効な問題数: ${validation.problemCount || 0}`,
                warnings.length ? `注意:\n${warnings.join('\n')}` : ''
            ].filter(Boolean).join('\n');
            alert(message);
        } else {
            const message = json.error || (errors.length ? errors.join('\n') : 'チェックに失敗しました。');
            alert(message);
        }
    } catch (e) {
        console.error(e);
        alert(`チェックに失敗しました。通信状況やGASの設定を確認してください。\n${e.message || e}`);
    } finally {
        els.adminCheckBtn.disabled = false;
        els.adminCheckBtn.textContent = originalText;
    }
}

function getAchievementStorageKey() {
    if (!state.studentId) return '';
    return `${ACHIEVEMENT_STORAGE_PREFIX}${state.studentId}`;
}

function getAchievementStarCount() {
    const key = getAchievementStorageKey();
    if (!key) return 0;
    return Math.max(0, Number(localStorage.getItem(key) || 0) || 0);
}

function updateAchievementStars() {
    if (!els.achievementStars) return;
    const count = getAchievementStarCount();
    els.achievementStars.textContent = count > 0 ? '⭐'.repeat(count) : '';
}

function addAchievementStar() {
    const key = getAchievementStorageKey();
    if (!key) return;
    localStorage.setItem(key, String(getAchievementStarCount() + 1));
    updateAchievementStars();
}

function getRoundKeys() {
    return Object.keys(problemData);
}

function getRoundSelectKeys() {
    return Object.keys(problemData);
}

function compareRoundDesc(a, b) {
    const aNumber = extractRoundNumber(a);
    const bNumber = extractRoundNumber(b);
    if (aNumber !== bNumber) return bNumber - aNumber;
    return String(b).localeCompare(String(a), 'ja', { numeric: true });
}

function extractRoundNumber(value) {
    const match = String(value || '').match(/\d+/);
    return match ? Number(match[0]) : -1;
}

function normalizeProblemData(data) {
    const normalized = {};
    Object.entries(data || {}).forEach(([round, problems]) => {
        normalized[round] = (Array.isArray(problems) ? problems : [])
            .map(problem => ({
                ...problem,
                id: normalizeProblemId(problem.id),
            }))
            .filter(problem => problem.id);
    });
    return normalized;
}

function normalizeProblemId(value) {
    return String(value || '')
        .trim()
        .replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
        .replace(/[^\dA-Za-z_-]/g, '');
}

function getSelectedProblem() {
    const round = els.roundSelect.value;
    const problemId = els.problemSelect.value;
    if (!round || !problemId || !problemData[round]) return null;
    return problemData[round].find(problem => problem.id === problemId) || null;
}

async function renderSelectedProblem() {
    const problem = getSelectedProblem();
    if (!problem) {
        clearProblemDisplay();
        return;
    }

    els.problemDisplayLabel.textContent = `${problem.label} (${problem.id})`;
    els.problemDisplay.classList.remove('hidden');
    els.problemDisplayImage.removeAttribute('src');
    setProblemImageFitMode(els.problemDisplayImage, els.problemFitBtn, false);
    els.problemFitBtn.classList.add('hidden');
    els.problemDisplayImage.alt = `${problem.label} の問題画像`;
    els.problemDisplayMessage.textContent = '問題画像を読み込んでいます...';

    try {
        const imageData = await fetchProblemImage(problem.id);
        if (els.problemSelect.value !== problem.id) return;

        if (imageData) {
            els.problemDisplayImage.src = imageData;
            els.problemFitBtn.classList.remove('hidden');
            els.problemDisplayMessage.textContent = '';
        } else if (problem.imageUrl) {
            els.problemDisplayImage.src = problem.imageUrl;
            els.problemFitBtn.classList.remove('hidden');
            els.problemDisplayMessage.textContent = '';
        } else {
            els.problemDisplayImage.alt = '問題画像が見つかりません';
            els.problemDisplayMessage.textContent = '問題画像が見つかりません。';
        }
    } catch (e) {
        console.error(e);
        if (problem.imageUrl) {
            els.problemDisplayImage.src = problem.imageUrl;
            els.problemFitBtn.classList.remove('hidden');
            els.problemDisplayMessage.textContent = '';
        } else {
            els.problemDisplayImage.alt = '問題画像を読み込めませんでした';
            els.problemDisplayMessage.textContent = `問題画像を読み込めませんでした。${e.message ? ` (${e.message})` : ''}`;
        }
    }
}

async function fetchProblemImage(problemId) {
    const response = await fetch(GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'getProblemImage',
            problemId,
        }),
    });
    if (!response.ok) {
        throw new Error(`画像APIエラー: HTTP ${response.status}`);
    }
    const json = await response.json();
    if (json.error) throw new Error(json.error);
    return json.status === 'success' ? json.imageData : '';
}

function clearProblemDisplay() {
    els.problemDisplay.classList.add('hidden');
    els.problemDisplay.classList.remove('congratulations');
    els.problemDisplayLabel.textContent = '';
    els.problemDisplayImage.removeAttribute('src');
    setProblemImageFitMode(els.problemDisplayImage, els.problemFitBtn, false);
    els.problemFitBtn.classList.add('hidden');
    els.problemDisplayImage.alt = '問題画像';
    els.problemDisplayMessage.textContent = '';
}

function setProblemImageFitMode(image, button, fitPage) {
    if (!image || !button) return;
    image.classList.toggle('fit-page', fitPage);
    button.setAttribute('aria-pressed', fitPage ? 'true' : 'false');
    button.textContent = fitPage ? '横幅に合わせる' : '1ページ全体を表示する';
}

function toggleProblemImageFit(image, button) {
    if (!image || !button) return;
    setProblemImageFitMode(image, button, !image.classList.contains('fit-page'));
}

function setProblemPickerVisible(isVisible) {
    if (!els.problemPicker) return;
    const isUraMode = !els.uraModeBanner.classList.contains('hidden');
    els.problemPicker.classList.toggle('hidden', !isVisible);
    els.startOtherTestBtn.classList.toggle('hidden', isVisible && !isUraMode);
}

function setUraModeVisible(isVisible) {
    els.uraModeBanner.classList.toggle('hidden', !isVisible);
    if (!isVisible) {
        els.uraModeBanner.classList.remove('congratulations');
        els.uraModeBanner.textContent = '裏モード開放！';
    }
    els.roundSelect.disabled = isVisible;
}

function setupEventListeners() {
    els.roundSelect.addEventListener('change', (e) => {
        const round = e.target.value;
        setUraModeVisible(false);
        clearProblemDisplay();
        if (round) {
            selectStartProblemForRound(round);
        } else {
            populateProblemSelect('');
            setProblemPickerVisible(true);
            updateProblemAccordionActive('', '');
        }
    });

    if (els.problemAccordion) {
        els.problemAccordion.addEventListener('click', event => {
            const button = event.target.closest('[data-round]');
            if (!button || button.disabled) return;
            const round = button.getAttribute('data-round');
            const problemId = button.getAttribute('data-problem-id');
            if (problemId) {
                selectProblem(round, problemId);
            } else {
                selectStartProblemForRound(round);
            }
        });
    }

    els.problemSelect.addEventListener('change', () => {
        exitReviewMode();
        clearProblemDisplay();
        resetImagesForNextProblem();
        els.resultSection.classList.add('hidden');
        clearMismatchMessage();
        setProblemPickerVisible(false);
        renderSelectedProblem();
    });

    els.saveSetupBtn.addEventListener('click', () => {
        const rawId = els.studentIdInput.value.trim();
        const id = formatStudentId(rawId);
        const name = els.studentNameInput.value.trim();
        if (!rawId) {
            alert('生徒番号を入力してください。');
            return;
        }
        if (!name) {
            alert('氏名を入力してください。');
            return;
        }

        els.studentIdInput.value = id;
        state.studentId = id;
        state.studentName = name;
        localStorage.setItem('student_id', id);
        localStorage.setItem('student_name', name);
        updateUserInfo();
        updateAdminCheckButton();
        els.setupModal.classList.add('hidden');
    });

    els.settingsBtn.addEventListener('click', () => {
        els.studentIdInput.value = state.studentId;
        els.studentNameInput.value = state.studentName;
        els.setupModal.classList.remove('hidden');
    });

    els.setupModal.addEventListener('click', (e) => {
        if (e.target === els.setupModal && state.studentId && state.studentName) {
            els.setupModal.classList.add('hidden');
        }
    });

    els.uploadBtn.addEventListener('click', openCamera);
    els.addMoreBtn.addEventListener('click', openCamera);
    els.cameraShutterBtn.addEventListener('click', takePhoto);
    els.cameraSwitchBtn.addEventListener('click', switchCamera);
    els.cameraCloseBtn.addEventListener('click', stopCamera);
    els.evaluateBtn.addEventListener('click', evaluateAnswer);
    if (els.toggleProblemBtn) {
        els.toggleProblemBtn.addEventListener('click', toggleProblemFromResult);
    }
    if (els.problemFitBtn) {
        els.problemFitBtn.addEventListener('click', () => toggleProblemImageFit(els.problemDisplayImage, els.problemFitBtn));
    }
    if (els.gradedProblemFitBtn) {
        els.gradedProblemFitBtn.addEventListener('click', () => toggleProblemImageFit(els.gradedProblemImage, els.gradedProblemFitBtn));
    }
    if (els.adminCheckBtn) {
        els.adminCheckBtn.addEventListener('click', validateSpreadsheetFromAdminButton);
    }

    els.clearAllBtn.addEventListener('click', () => {
        state.images = [];
        els.cameraInput.value = '';
        renderThumbnails();
    });

    els.cameraInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const originalText = els.uploadBtn.innerHTML;
        try {
            els.uploadBtn.disabled = true;
            els.uploadBtn.innerHTML = '画像を処理中...';

            for (let i = 0; i < files.length; i++) {
                const result = await readFile(files[i]);
                state.images.push(result);
            }

            els.cameraInput.value = '';
            renderThumbnails();
        } catch (error) {
            alert('画像の読み込みに失敗しました。');
            console.error(error);
        } finally {
            els.uploadBtn.disabled = false;
            els.uploadBtn.innerHTML = originalText;
        }
    });

    if (els.screenshotBtn) {
        els.screenshotBtn.addEventListener('click', saveReviewScreenshot);
    }

    els.newQuestionBtn.addEventListener('click', () => {
        exitReviewMode();
        clearProblemDisplay();
        state.images = [];
        els.cameraInput.value = '';
        renderThumbnails();
        els.resultSection.classList.add('hidden');
        hideGradedProblem();
        setProblemPickerVisible(true);
    });

    els.startOtherTestBtn.addEventListener('click', startOtherTest);
}

async function saveReviewScreenshot() {
    if (!els.resultSection || els.resultSection.classList.contains('hidden')) return;
    if (!window.html2canvas) {
        alert('画像保存の準備がまだできていません。少し待ってからもう一度押してください。');
        return;
    }

    const originalText = els.screenshotBtn ? els.screenshotBtn.textContent : '';
    if (els.screenshotBtn) {
        els.screenshotBtn.disabled = true;
        els.screenshotBtn.textContent = '画像を作成中...';
    }

    try {
        const canvas = await html2canvas(els.resultSection, {
            backgroundColor: '#ffffff',
            scale: Math.min(2, window.devicePixelRatio || 1),
            useCORS: true,
            removeContainer: true,
            onclone: clonedDoc => {
                clonedDoc.querySelectorAll('.screenshot-exclude').forEach(node => {
                    node.style.display = 'none';
                });
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    *, *::before, *::after {
                        animation: none !important;
                        transition: none !important;
                        filter: none !important;
                        backdrop-filter: none !important;
                    }
                    #result-section,
                    #result-section * {
                        opacity: 1 !important;
                    }
                    #result-section {
                        background: #ffffff !important;
                        box-shadow: none !important;
                    }
                    .result-details,
                    .graded-problem-display,
                    .problem-display-image {
                        background: #ffffff !important;
                    }
                `;
                clonedDoc.head.appendChild(style);
            },
        });
        const link = document.createElement('a');
        const problem = state.gradedProblem || getSelectedProblem() || {};
        const safeId = String(problem.id || 'review').replace(/[^a-zA-Z0-9_-]/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.download = `clear-maker-review-${safeId}-${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (error) {
        console.error(error);
        alert('添削画面の画像保存に失敗しました。もう一度試してください。');
    } finally {
        if (els.screenshotBtn) {
            els.screenshotBtn.disabled = false;
            els.screenshotBtn.textContent = originalText || '📷添削画面を画像で保存📷';
        }
    }
}
function renderThumbnails() {
    els.imagePreviewList.innerHTML = '';

    if (state.images.length === 0) {
        els.previewContainer.classList.add('hidden');
        els.evaluateBtn.classList.add('hidden');
        els.uploadBtn.classList.remove('hidden');
        return;
    }

    state.images.forEach((img, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail-wrapper';

        const imgEl = document.createElement('img');
        imgEl.src = `data:${img.mimeType};base64,${img.data}`;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-thumb-btn';
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            state.images.splice(index, 1);
            renderThumbnails();
        };

        wrapper.appendChild(imgEl);
        wrapper.appendChild(removeBtn);
        els.imagePreviewList.appendChild(wrapper);
    });

    els.uploadBtn.classList.add('hidden');
    els.previewContainer.classList.remove('hidden');
    els.evaluateBtn.classList.remove('hidden');
    els.resultSection.classList.add('hidden');
    exitReviewMode();
}

async function readFile(file) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
    return processImage(dataUrl);
}

function processImage(dataUrl, maxWidth = 1000, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const resultDataUrl = canvas.toDataURL('image/jpeg', quality);
            const splitIndex = resultDataUrl.indexOf(',');
            const mimeType = resultDataUrl.substring(5, splitIndex).split(';')[0];
            const base64Data = resultDataUrl.substring(splitIndex + 1);

            resolve({ mimeType, data: base64Data });
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        els.cameraInput.click();
        return;
    }

    try {
        els.cameraModal.classList.remove('hidden');
        await startStream();
    } catch (err) {
        console.error('Error opening camera:', err);
        els.cameraModal.classList.add('hidden');
        els.cameraInput.click();
    }
}

async function startStream() {
    if (cameraState.stream) {
        els.cameraVideo.srcObject = cameraState.stream;
        return;
    }

    const constraints = {
        video: {
            facingMode: cameraState.facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
        },
        audio: false,
    };

    cameraState.stream = await navigator.mediaDevices.getUserMedia(constraints);
    els.cameraVideo.srcObject = cameraState.stream;
}

function stopCamera() {
    els.cameraModal.classList.add('hidden');
}

async function switchCamera() {
    if (cameraState.stream) {
        cameraState.stream.getTracks().forEach(track => track.stop());
        cameraState.stream = null;
    }

    cameraState.facingMode = cameraState.facingMode === 'user' ? 'environment' : 'user';

    try {
        await startStream();
    } catch (err) {
        console.error('Error switching camera:', err);
        alert('カメラの切り替えに失敗しました。');
    }
}

function takePhoto() {
    const video = els.cameraVideo;
    const canvas = els.cameraCanvas;
    let width = video.videoWidth;
    let height = video.videoHeight;
    const maxWidth = 1000;

    if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    const splitIndex = dataUrl.indexOf(',');
    const base64Data = dataUrl.substring(splitIndex + 1);

    state.images.push({
        mimeType: 'image/jpeg',
        data: base64Data,
    });

    renderThumbnails();
    stopCamera();
}

async function evaluateAnswer() {
    if (state.images.length === 0) return;

    if (!state.studentId) {
        alert('生徒番号の登録が必要です。');
        els.setupModal.classList.remove('hidden');
        return;
    }

    const problemId = els.problemSelect.value;
    const gradedProblem = getSelectedProblem();
    if (!problemId) {
        alert('回と問題を選択してください。');
        return;
    }

    els.evaluateBtn.disabled = true;
    els.evaluateBtn.classList.add('hidden');
    clearMismatchMessage();
    els.loadingIndicator.classList.remove('hidden');
    els.resultSection.classList.add('hidden');

    const randomDelay = Math.floor(Math.random() * 5000);
    await new Promise(resolve => setTimeout(resolve, randomDelay));

    try {
        const prompt = `
【重要】
最初に、指定された問題番号と画像内の問題が一致しているか確認してください。
もし全く異なる問題の解答であると判断した場合は、添削やフォーマット出力は行わず、次の文字列のみを出力してください。
指定した問題が間違っています

問題が一致している場合は、生徒の解答を添削してください。
判定は、解答した問題数の8割以上が正解なら「合格」、それ以外なら「再チャレンジ」としてください。
未回答・空欄・答えが書かれていない小問・読み取れない小問は、すべて不正解として総問題数に含めてください。例えば5問中2問正解で3問未回答なら、2問中2問正解ではなく5問中2問正解として不合格です。
生徒が途中式から書き始めている場合も、計算過程として正しければ正解として扱ってください。
雑談や無関係な話題は省略してください。

以下のフォーマットで出力してください。
[判定]
「合格」または「再チャレンジ」のどちらかのみ

[詳細]
結果: 例 5問中4問正解
読み取った解答と正誤:
各問題について、途中式や解説は省き、答えと正誤のみを書いてください。
未回答の小問も省略せず、「未回答: 不正解」と書いてください。
形式例:
(1) 正解: [答え]
(2) 不正解: [答え]

フィードバック:
不正解の問題がある場合のみ、問題番号、間違えた原因、正答、簡単な解法を必ず書いてください。
正答は、GASから渡される【登録済み正答】または【登録済み模範解答】の該当部分を使ってください。
簡単な解法は、GASから渡される【登録済み解説】または【登録済み模範解答】の該当部分を短く引用・要約してください。
登録済み情報がある場合、正答や解説を推測で新しく作らないでください。登録済み情報で判断できない場合だけ「登録済み解説を確認してください」と短く書いてください。
各不正解について、次の形を守ってください。
(問題番号) **原因:** [短く]
**正答:** [正しい答え]
**簡単な解法:** [2〜5文または短い式で、方針、途中の要点、最後の確認が分かる説明]
原因には、可能なら「たすき掛け」「因数分解」「平方完成」「判別式」「場合分け」など、復習すべきテーマ名を必ず含めてください。
全問正解の場合は、短いお祝いの言葉のみで構いません。
数式はKaTeX形式で書いてください。
不等号は \\le や \\ge、\\leq や \\geq ではなく、必ず2本線の \\leqq と \\geqq に統一してください。
分数は (11)/(3) のように書かず、必ず \\frac{11}{3} の形で書き、数式部分は $...$ で囲んでください。

[躓き明細]
不正解の小問ごとに「小問番号 | 躓き大分類 | 躓き小分類 | 原因詳細」の1行を出力。全問正解は「なし」のみ。
大分類は「計算・式変形」「知識・解法」「問題の読み取り」「記述・提出」「その他」から1つ。小分類は、計算・式変形: 符号/計算/展開・因数分解/分数・約分/代入/その他、知識・解法: 公式/定義・性質/解法方針/場合分け/その他、問題の読み取り: 条件の見落とし/図表・グラフ/単位・範囲/その他、記述・提出: 答えの書き忘れ/途中式不足/未回答/判読不能/その他。`;

        const payload = {
            apiKey: 'server',
            isStudentApp: true,
            subject: 'other',
            problemId,
            userPrompt: prompt,
            images: {
                student: state.images,
            },
        };

        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
        });
        const data = await response.json();
        els.loadingIndicator.classList.add('hidden');

        if (data.error) {
            throw new Error(data.error);
        }

        const aiResponse = getAiResponseText(data);
        state.gradedProblem = gradedProblem;
        const badgeText = displayResult(aiResponse);
        if (badgeText) {
            saveResultWithRetry(aiResponse, problemId).catch(error => {
                console.error('Failed to save result after grading', error);
                showSaveWarning(error);
            });
            els.loadingIndicator.classList.add('hidden');
        }
    } catch (err) {
        console.error(err);
        alert('エラーが発生しました: ' + err.message);
        els.evaluateBtn.classList.remove('hidden');
    } finally {
        els.loadingIndicator.classList.add('hidden');
        els.evaluateBtn.disabled = false;
    }
}

function getAiResponseText(data) {
    const text = data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;

    if (text) return text;

    const finishReason = data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].finishReason;
    throw new Error(finishReason
        ? `AIの添削結果を取得できませんでした。理由: ${finishReason}`
        : 'AIの添削結果を取得できませんでした。');
}

function displayResult(text) {
    if (text.includes('指定した問題が間違っています')) {
        showMismatchMessage('アップロードした画像と現在の問題が一致していないようです。問題番号と画像を確認して、もう一度添削してください。');
        els.evaluateBtn.classList.remove('hidden');
        return '';
    }

    let badgeText = '判定不明';
    let detailText = text;

    const badgeMatch = text.match(/\[判定\]\s*([^\n]+)/);
    if (badgeMatch) {
        badgeText = badgeMatch[1].trim();
        const detailSplit = text.split(/\[詳細\]/);
        if (detailSplit.length > 1) {
            detailText = detailSplit[1].trim();
        }
    } else if (text.includes('合格')) {
        badgeText = '合格';
    } else if (text.includes('再チャレンジ') || text.includes('見直し')) {
        badgeText = '再チャレンジ';
    }

    if (badgeText.includes('合格')) {
        els.resultBadge.className = 'result-badge pass';
        els.resultBadge.textContent = '合格';
    } else {
        els.resultBadge.className = 'result-badge retry';
        els.resultBadge.textContent = '再チャレンジ';
    }

    const processedText = normalizeResultMarkdown(detailText);
    const resultHtml = normalizeResultHtml(marked.parse(processedText, { breaks: true }));
    els.resultContent.innerHTML = resultHtml;
    renderMath(els.resultContent);

    els.resultSection.classList.remove('hidden');
    enterReviewMode();
    showGradedProblem().catch(error => console.error('Failed to show graded problem', error));
    clearMismatchMessage();
    return badgeText;
}

async function toggleProblemFromResult() {
    if (!els.gradedProblemDisplay) return;
    const shouldShow = els.gradedProblemDisplay.classList.contains('hidden');
    if (!shouldShow) {
        hideGradedProblem();
        return;
    }
    await showGradedProblem();
}

function enterReviewMode() {
    if (els.appContent) els.appContent.classList.add('review-mode');
}

function exitReviewMode() {
    if (els.appContent) els.appContent.classList.remove('review-mode');
}

function hideGradedProblem() {
    if (!els.gradedProblemDisplay || !els.toggleProblemBtn) return;
    els.gradedProblemDisplay.classList.add('hidden');
    els.toggleProblemBtn.setAttribute('aria-expanded', 'false');
    els.toggleProblemBtn.textContent = '問題を表示する';
}

async function showGradedProblem() {
    const problem = state.gradedProblem;
    if (
        !problem ||
        !els.gradedProblemDisplay ||
        !els.toggleProblemBtn ||
        !els.gradedProblemLabel ||
        !els.gradedProblemImage ||
        !els.gradedProblemMessage
    ) return;

    els.gradedProblemDisplay.classList.remove('hidden');
    els.toggleProblemBtn.setAttribute('aria-expanded', 'true');
    els.toggleProblemBtn.textContent = '問題を隠す';
    els.gradedProblemLabel.textContent = `${problem.label} (${problem.id})`;
    els.gradedProblemImage.removeAttribute('src');
    setProblemImageFitMode(els.gradedProblemImage, els.gradedProblemFitBtn, false);
    els.gradedProblemFitBtn.classList.add('hidden');
    els.gradedProblemMessage.textContent = '問題画像を読み込んでいます...';

    try {
        const imageData = await fetchProblemImage(problem.id);
        if (els.gradedProblemDisplay.classList.contains('hidden')) return;
        if (imageData) {
            els.gradedProblemImage.src = imageData;
            els.gradedProblemFitBtn.classList.remove('hidden');
            els.gradedProblemMessage.textContent = '';
        } else if (problem.imageUrl) {
            els.gradedProblemImage.src = problem.imageUrl;
            els.gradedProblemFitBtn.classList.remove('hidden');
            els.gradedProblemMessage.textContent = '';
        } else {
            els.gradedProblemMessage.textContent = '問題画像が見つかりません。';
        }
    } catch (error) {
        console.error(error);
        if (problem.imageUrl) {
            els.gradedProblemImage.src = problem.imageUrl;
            els.gradedProblemFitBtn.classList.remove('hidden');
            els.gradedProblemMessage.textContent = '';
        } else {
            els.gradedProblemMessage.textContent = '問題画像を読み込めませんでした。';
        }
    }
}

function showSaveWarning(error) {
    if (!els.resultContent) return;
    const warning = document.createElement('div');
    warning.className = 'save-warning';
    warning.textContent = `添削結果の表示は完了しましたが、添削結果ログへの保存に失敗しました。先生にこの画面を見せてください。${error && error.message ? ` (${error.message})` : ''}`;
    els.resultContent.prepend(warning);
}

function normalizeResultMarkdown(text) {
    const mathBlocks = [];
    const normalizeMathCommands = value => value
        .replace(/\\leq\b|\\le\b/g, '\\leqq')
        .replace(/\\geq\b|\\ge\b/g, '\\geqq');
    const storeMath = match => {
        const key = `MATHPLACEHOLDER${mathBlocks.length}END`;
        mathBlocks.push(normalizeMathCommands(match));
        return key;
    };

    let normalized = text
        .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+?\$/g, storeMath)
        .replace(/\*{2}\s*(原因|正答|簡単な解法)\s*[:：]\s*\*{2}/g, '**$1:**')
        .replace(/(^|\n)(\s*(?:\(\d+\)\s*)?)(?:\*\*)?(原因|正答|簡単な解法)\s*[:：](?:\*\*)?\s*/g, '$1$2**$3:** ')
        .replace(/\\leqq\b/g, '≦')
        .replace(/\\geqq\b/g, '≧')
        .replace(/\\leq\b/g, '≦')
        .replace(/\\geq\b/g, '≧')
        .replace(/\\le\b/g, '≦')
        .replace(/\\ge\b/g, '≧')
        .replace(/\\lt\b/g, '<')
        .replace(/\\gt\b/g, '>')
        .replace(/(-?)\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, sign, numerator, denominator) => `$${sign}\\frac{${numerator}}{${denominator}}$`)
        .replace(/(-?)\s*\((-?\d+)\)\/\((-?\d+)\)/g, (_, sign, numerator, denominator) => `$${sign}\\frac{${numerator}}{${denominator}}$`);

    normalized = normalized.replace(/MATHPLACEHOLDER(\d+)END/g, (_, index) => mathBlocks[Number(index)] || '');
    return normalized;
}

function normalizeResultHtml(html) {
    return html.replace(/\*\*(原因|正答|簡単な解法):\*\*/g, '<strong>$1:</strong>');
}

function showMismatchMessage(message) {
    if (!els.mismatchMessage) return;
    els.mismatchMessage.textContent = message;
    els.mismatchMessage.classList.remove('hidden');
}

function clearMismatchMessage() {
    if (!els.mismatchMessage) return;
    els.mismatchMessage.textContent = '';
    els.mismatchMessage.classList.add('hidden');
}

function startOtherTest() {
    exitReviewMode();
    setUraModeVisible(false);
    clearProblemDisplay();
    resetImagesForNextProblem();
    clearMismatchMessage();
    els.resultSection.classList.add('hidden');
    els.roundSelect.value = '';
    populateProblemSelect('');
    setProblemPickerVisible(true);
}

function selectStartProblemForRound(round) {
    if (!round || !problemData[round] || problemData[round].length === 0) return;

    const startProblem = getStartProblemForRound(round) || problemData[round][0];
    selectProblem(round, startProblem.id);
}

function getStartProblemForRound(round) {
    const roundNumber = extractRoundNumber(round);
    const roundPart = roundNumber >= 0 ? String(roundNumber).padStart(2, '0') : '';
    if (roundPart) {
        const expectedEnd = `${roundPart}011`;
        const roundMatchedProblem = problemData[round].find(problem => normalizeProblemId(problem.id).endsWith(expectedEnd));
        if (roundMatchedProblem) return roundMatchedProblem;
    }
    return getProblemBySuffix(round, '011');
}

function getProblemBySuffix(round, suffix) {
    if (!round || !problemData[round]) return null;
    return problemData[round].find(problem => normalizeProblemId(problem.id).endsWith(suffix)) || null;
}

function selectProblem(round, problemId) {
    if (!round || !problemId || !problemData[round]) return;

    els.loadingIndicator.classList.add('hidden');
    setUraModeVisible(false);
    resetImagesForNextProblem();
    els.roundSelect.value = round;
    populateProblemSelect(round);
    els.problemSelect.value = problemId;
    setProblemPickerVisible(true);
    renderSelectedProblem();
    updateProblemAccordionActive(round, problemId);
}

function renderProblemAccordion() {
    if (!els.problemAccordion) return;
    const rounds = getRoundSelectKeys();
    if (rounds.length === 0) {
        els.problemAccordion.innerHTML = '<div class="problem-accordion-empty">表示できる問題がありません。</div>';
        return;
    }

    els.problemAccordion.innerHTML = rounds.map(round => {
        const problems = problemData[round] || [];
        const startProblem = getStartProblemForRound(round) || problems[0];
        const problemLabel = startProblem ? (startProblem.label || startProblem.id) : '問題がありません';
        const problemIdAttr = startProblem ? ` data-problem-id="${escapeHtml(startProblem.id)}"` : '';
        return `
            <button class="problem-round-button" type="button" data-round="${escapeHtml(round)}"${problemIdAttr} ${startProblem ? '' : 'disabled'}>
                <span class="problem-round-name">${escapeHtml(round)}</span>
                <span class="problem-round-meta">${escapeHtml(problemLabel)}</span>
            </button>
        `;
    }).join('');
}

function updateProblemAccordionActive(round, problemId) {
    if (!els.problemAccordion) return;
    els.problemAccordion.querySelectorAll('[data-round]').forEach(button => {
        const buttonProblemId = button.getAttribute('data-problem-id') || '';
        const isActive = button.getAttribute('data-round') === round && (!problemId || !buttonProblemId || buttonProblemId === problemId);
        button.classList.toggle('active', isActive);
    });
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function populateProblemSelect(round) {
    els.problemSelect.innerHTML = '<option value="">-- 問題を選択 --</option>';
    if (round && problemData[round]) {
        problemData[round].forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.label;
            els.problemSelect.appendChild(opt);
        });
        els.problemSelect.disabled = false;
    } else {
        els.problemSelect.disabled = true;
    }
}

function resetImagesForNextProblem() {
    state.images = [];
    els.cameraInput.value = '';
    els.imagePreviewList.innerHTML = '';
    els.previewContainer.classList.add('hidden');
    els.evaluateBtn.classList.add('hidden');
    els.uploadBtn.classList.remove('hidden');
}

async function saveResultWithRetry(resultText, problemId) {
    const payload = {
        action: 'saveResult',
        studentId: state.studentId,
        studentName: state.studentName,
        problemId: problemId || els.problemSelect.value || '',
        resultText,
    };

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
            });
            const json = await response.json();
            if (!response.ok || json.error || json.status !== 'success') {
                throw new Error(json.error || `保存APIエラー: HTTP ${response.status}`);
            }
            return json;
        } catch (e) {
            lastError = e;
            console.error(`Failed to save result to GAS (attempt ${attempt})`, e);
            if (attempt < 3) {
                await wait(700 * attempt + Math.floor(Math.random() * 500));
            }
        }
    }

    throw new Error(`添削結果ログへの保存に失敗しました。通信状況を確認してもう一度試してください。${lastError && lastError.message ? ` (${lastError.message})` : ''}`);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function renderMath(element) {
    if (typeof renderMathInElement !== 'function') {
        setTimeout(() => renderMath(element), 100);
        return;
    }

    try {
        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '\\[', right: '\\]', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
            ],
            throwOnError: false,
        });
    } catch (e) {
        console.error('KaTeX rendering error:', e);
    }
}


init();














