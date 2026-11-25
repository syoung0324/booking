import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  getDocs,
  getDocsFromServer,
  getDocFromServer,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =========================================================================
// 1. Firebase Firestore 初始化設定與管理者狀態管理
// =========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAlx0ztnMKhRvJQL2rMC-bQEflXNBbbccI",
  authDomain: "booking-61243.firebaseapp.com",
  projectId: "booking-61243",
  storageBucket: "booking-61243.firebasestorage.app",
  messagingSenderId: "174470293318",
  appId: "1:174470293318:web:c76891e13bf36adea3e747",
  measurementId: "G-BV926611LZ"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION_NAME = "speaking_club_scripts";
const LOCAL_AVATAR_KEY = "speaking_club_cute_avatar";
const ADMIN_SESSION_KEY = "speaking_club_admin_session";

let adminPasswordSession = sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
let isAdminMode = Boolean(adminPasswordSession);

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function promptAdminPassword(actionDescription) {
  return new Promise((resolve) => {
    const modal = document.getElementById('adminAuthModal');
    const descEl = document.getElementById('adminAuthDesc');
    const inputEl = document.getElementById('adminPasswordInput');
    const cancelBtn = document.getElementById('adminCancelBtn');
    const confirmBtn = document.getElementById('adminConfirmBtn');

    descEl.textContent = `即將執行「${actionDescription}」，請輸入管理員密碼：`;
    inputEl.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => inputEl.focus(), 50);

    function cleanup(result) {
      modal.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      inputEl.removeEventListener('keydown', onKeydown);
      resolve(result);
    }

    function onCancel() {
      cleanup(null);
    }

    function onConfirm() {
      const val = inputEl.value.trim();
      if (!val) {
        inputEl.focus();
        return;
      }
      cleanup(val);
    }

    function onKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    inputEl.addEventListener('keydown', onKeydown);
  });
}

function showErrorAlertModal(title, htmlMessage, allowRetry = true) {
  return new Promise((resolve) => {
    const modal = document.getElementById('errorAlertModal');
    const titleEl = document.getElementById('errorAlertTitle');
    const msgEl = document.getElementById('errorAlertMsg');
    const closeBtn = document.getElementById('errorCloseBtn');
    const retryBtn = document.getElementById('errorRetryBtn');

    titleEl.textContent = title;
    msgEl.innerHTML = htmlMessage;
    if (allowRetry) {
      retryBtn.classList.remove('hidden');
    } else {
      retryBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    setTimeout(() => (allowRetry ? retryBtn : closeBtn).focus(), 50);

    function cleanup(retry) {
      modal.classList.add('hidden');
      closeBtn.removeEventListener('click', onClose);
      retryBtn.removeEventListener('click', onRetry);
      document.removeEventListener('keydown', onKeydown);
      resolve(retry);
    }

    function onClose() {
      cleanup(false);
    }

    function onRetry() {
      cleanup(true);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    closeBtn.addEventListener('click', onClose);
    retryBtn.addEventListener('click', onRetry);
    document.addEventListener('keydown', onKeydown);
  });
}

function setAdminSession(password) {
  adminPasswordSession = password || "";
  isAdminMode = Boolean(adminPasswordSession);
  if (isAdminMode) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, adminPasswordSession);
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    editingTarget = { secIdx: null, itemIdx: null };
    isEditingHeader = false;
  }
  applyAdminUiPermissions();
  renderScript(currentScript);
}

function applyAdminUiPermissions() {
  const saveBtn = document.getElementById('saveCloudBtn');
  const deleteBtn = document.getElementById('deleteCloudBtn');
  const translateBtn = document.getElementById('translateBtn');

  // 尋找匯入 PDF 的按鈕或外層 label
  const pdfInput = document.querySelector('input[type="file"][onchange*="handlePdfUpload"], input[type="file"][accept*="pdf"]');
  const pdfWrapper = pdfInput ? (pdfInput.closest('label') || pdfInput.closest('button') || pdfInput) : null;

  if (saveBtn) saveBtn.classList.toggle('hidden', !isAdminMode);
  if (translateBtn) translateBtn.classList.toggle('hidden', !isAdminMode);
  if (pdfWrapper) pdfWrapper.classList.toggle('hidden', !isAdminMode);

  if (deleteBtn) {
    const canDeleteCloud = isAdminMode && currentScript?.id && currentScript.id !== 'default';
    deleteBtn.classList.toggle('hidden', !canDeleteCloud);
  }

  ensureAdminToggleButton();
}

function ensureAdminToggleButton() {
  let adminBtn = document.getElementById('adminModeToggleBtn');
  if (!adminBtn) {
    const anchorBtn =
      document.getElementById('saveCloudBtn') ||
      document.getElementById('translateBtn') ||
      document.getElementById('playAllBtn');

    if (!anchorBtn || !anchorBtn.parentElement) return;

    adminBtn = document.createElement('button');
    adminBtn.id = 'adminModeToggleBtn';
    adminBtn.type = 'button';
    adminBtn.addEventListener('click', window.handleAdminToggleClick);
    anchorBtn.parentElement.appendChild(adminBtn);
  }

  if (isAdminMode) {
    adminBtn.className =
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 shadow-2xs transition shrink-0';
    adminBtn.innerHTML = '<span>👑</span><span>管理者（登出）</span>';
    adminBtn.title = '目前為管理者模式，點擊可登出並切換為一般瀏覽模式';
  } else {
    adminBtn.className =
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs transition shrink-0';
    adminBtn.innerHTML = '<span>🔐</span><span>管理者登入</span>';
    adminBtn.title = '登入管理者以編輯講稿、匯入 PDF 或儲存雲端';
  }
}

window.handleAdminToggleClick = async function() {
  if (isAdminMode) {
    setAdminSession("");
    showToast('🔒 已登出管理者模式，目前為一般學員瀏覽畫面。');
    return;
  }

  const enteredPassword = await promptAdminPassword('登入管理者模式');
  if (!enteredPassword) return;

  const adminBtn = document.getElementById('adminModeToggleBtn');
  const origHtml = adminBtn ? adminBtn.innerHTML : '';
  if (adminBtn) {
    adminBtn.disabled = true;
    adminBtn.innerHTML = '<span>⏳</span><span>驗證中...</span>';
  }

  let shouldRetry = false;
  try {
    // 透過 Firestore 安全規則驗證密碼（不寫入 updatedAt，不影響講稿清單）
    await setDoc(
      doc(db, COLLECTION_NAME, "_auth_verify"),
      {
        adminKey: enteredPassword,
        verifiedAt: serverTimestamp()
      },
      { merge: true }
    );

    setAdminSession(enteredPassword);
    showToast('👑 管理者登入成功！已解鎖編輯、刪除、匯入 PDF 與雲端儲存功能。');
  } catch (err) {
    console.error("管理者登入驗證失敗:", err);
    const isAuthError = err.code === 'permission-denied' ||
      (err.message && (err.message.includes('Missing or insufficient permissions') || err.message.includes('PERMISSION_DENIED')));

    if (isAuthError) {
      showToast('❌ 管理員密碼錯誤，無法進入管理者模式。', true);
      shouldRetry = await showErrorAlertModal(
        "管理員密碼錯誤",
        "您輸入的管理員密碼不正確，請重新輸入正確密碼以啟用編輯功能。",
        true
      );
    } else {
      showToast(`❌ 驗證連線異常：${err.message}`, true);
    }
  } finally {
    if (adminBtn) {
      adminBtn.disabled = false;
      if (!isAdminMode) adminBtn.innerHTML = origHtml;
    }
  }

  if (shouldRetry) {
    await window.handleAdminToggleClick();
  }
};

// =========================================================================
// 2. 自動英翻中引擎（支援無中文註解與填空單字後自動補齊繁體中文）
// =========================================================================
const translationCache = new Map();

async function translateEnToZhTW(enText) {
  const clean = (enText || '').trim();
  if (!clean) return '';
  if (translationCache.has(clean)) return translationCache.get(clean);

  const hasExPrefix = /^Ex:\s*/i.test(clean);
  const textToTranslate = hasExPrefix ? clean.replace(/^Ex:\s*/i, '') : clean;

  let translated = '';

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(textToTranslate)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.[0])) {
        translated = data[0].map(seg => seg[0] || '').join('').trim();
      }
    }
  } catch (e) {
    console.warn('主要翻譯端點暫時無法連線，切換備援翻譯:', e);
  }

  if (!translated) {
    try {
      const backupUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=en|zh-TW`;
      const res = await fetch(backupUrl);
      if (res.ok) {
        const data = await res.json();
        if (data?.responseData?.translatedText) {
          translated = data.responseData.translatedText.trim();
        }
      }
    } catch (e) {
      console.warn('備援翻譯端點失敗:', e);
    }
  }

  if (translated) {
    const finalZh = hasExPrefix ? `範例：${translated}` : translated;
    translationCache.set(clean, finalZh);
    return finalZh;
  }
  return '';
}

function buildFilledSentenceText(item) {
  if (!item || !item.templateEn) return item?.en || '';
  const filled = Array.isArray(item.filledValues) ? item.filledValues : [];
  let fullSentence = '';
  item.templateEn.forEach((part, i) => {
    fullSentence += part;
    if (i < item.placeholders.length) {
      const val = (filled[i] || '').trim();
      fullSentence += val || item.placeholders[i];
    }
  });
  return fullSentence.replace(/[^\S\n]+/g, ' ').trim();
}

function hasAnyFilledBlank(item) {
  return Array.isArray(item?.filledValues) && item.filledValues.some(v => (v || '').trim().length > 0);
}

function cleanSubHeadingText(text) {
  return String(text || '').replace(/^[.．:：|｜\-\s]+/, '').trim();
}

async function autoTranslateMissingChinese(scriptObj, silentIfNone = true, forceRetranslateFilled = false) {
  if (!scriptObj || !Array.isArray(scriptObj.sections)) return 0;

  const tasks = [];

  scriptObj.sections.forEach(sec => {
    const cleanTitle = cleanSubHeadingText(sec.titleEn);
    if ((!sec.titleZh || !sec.titleZh.trim() || sec.titleZh === '口說練習段落') && cleanTitle && !/^(Part|Step)\s*\d+$/i.test(cleanTitle)) {
      tasks.push(async () => {
        const zhTitle = await translateEnToZhTW(cleanTitle);
        if (zhTitle) sec.titleZh = zhTitle;
      });
    }

    sec.items.forEach(item => {
      const hasZh = item.zh && item.zh.trim().length > 0;

      if (item.templateEn) {
        if (hasAnyFilledBlank(item) && (!hasZh || forceRetranslateFilled)) {
          tasks.push(async () => {
            const fullSentence = buildFilledSentenceText(item);
            const zh = await translateEnToZhTW(fullSentence);
            if (zh) item.zh = zh;
          });
        } else if (!hasZh) {
          tasks.push(async () => {
            const templateStr = item.templateEn.join(' [___] ').replace(/[^\S\n]+/g, ' ').trim();
            const zh = await translateEnToZhTW(templateStr);
            if (zh) item.zh = `${zh}（填入單字後自動翻譯）`;
          });
        }
        return;
      }

      if (!hasZh && item.en) {
        tasks.push(async () => {
          const zh = await translateEnToZhTW(item.en);
          if (zh) item.zh = zh;
        });
      }
    });
  });

  if (tasks.length === 0) {
    if (!silentIfNone) {
      showToast('ℹ️ 所有句子與已填單字都已經有中文翻譯囉！');
    }
    return 0;
  }

  const translateBtn = document.getElementById('translateBtn');
  const origBtnHtml = translateBtn ? translateBtn.innerHTML : '';
  if (translateBtn) {
    translateBtn.disabled = true;
    translateBtn.innerHTML = '<span>⏳</span> 翻譯中...';
  }

  if (isAdminMode) {
    showToast(`🌐 正在翻譯 ${tasks.length} 句繁體中文...`);
  }

  const batchSize = 5;
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    await Promise.all(batch.map(fn => fn()));
    renderScript(scriptObj);
  }

  if (translateBtn) {
    translateBtn.disabled = false;
    translateBtn.innerHTML = origBtnHtml;
  }

  if (isAdminMode) {
    showToast(`✅ 已自動完成 ${tasks.length} 句繁體中文翻譯！請點擊「☁️ 儲存雲端」保存。`);
  }
  return tasks.length;
}

window.triggerManualTranslate = async function() {
  if (!isAdminMode) return;
  await autoTranslateMissingChinese(currentScript, false, true);
};

// =========================================================================
// 3. 預設範本資料
// =========================================================================
const defaultScriptData = {
  id: "default",
  title: "Speaking Club 11/13 8pm",
  meetUrl: "https://meet.google.com/ppf-tncw-krk",
  avatarUrl: "",
  sections: [
    {
      part: "Part 1",
      titleEn: "Mystery Object: Show & Guess",
      titleZh: "給提示猜物品",
      items: [
        { en: "Ex: It's yellow.", zh: "範例：它是黃色的。" },
        { en: "It's long.", zh: "它是長長的。" },
        { en: "I use it to write.", zh: "我用它來寫字。" },
        { en: "What is it?", zh: "它是什麼呢？" },
        { en: "A pencil!", zh: "是一支鉛筆！", isAnswer: true }
      ]
    },
    {
      part: "Part 2",
      titleEn: "My Dream Dinner Challenge",
      titleZh: "畫出晚餐",
      items: [
        {
          templateEn: ["For dinner, I have ", " and ", "."],
          placeholders: ["pizza", "salad"],
          filledValues: ["", ""],
          zh: "晚餐我吃（食物 1）和（食物 2）。"
        },
        {
          templateEn: ["I like ", "."],
          placeholders: ["corn soup"],
          filledValues: [""],
          zh: "我喜歡（某食物）。"
        },
        {
          templateEn: ["I don't like ", "."],
          placeholders: ["carrots"],
          filledValues: [""],
          zh: "我不喜歡（某食物）。"
        }
      ]
    },
    {
      part: "Part 3",
      titleEn: "Bigger Numbers!",
      titleZh: "聽句子，寫出比較大的數字",
      items: [
        { en: "Listen to the sentences and write down the bigger number.", zh: "聽句子，寫出比較大的數字。" }
      ]
    },
    {
      part: "Part 4",
      titleEn: "Number Bingo: 26–51",
      titleZh: "數字賓果",
      items: [
        { en: "Draw a 5x5 grid and write 25 different numbers from 26 to 51.", zh: "畫出 5x5 格，填入 26 到 51 之間 25 個不同數字。" },
        { en: "The teacher calls out the number.", zh: "老師唸數字。" },
        { en: "Cross out the numbers.", zh: "畫掉數字。" },
        { en: "You need to get 5 lines.", zh: "要得到五條線。" }
      ]
    }
  ]
};

let currentScript = structuredClone(defaultScriptData);
let savedScriptsMap = new Map();
let voices = [];
let isPlayingAll = false;
let playQueueIndex = 0;
let editingTarget = { secIdx: null, itemIdx: null };
let isEditingHeader = false;

function showToast(msg, isError = false) {
  const toast = document.getElementById('statusToast');
  const toastMsg = document.getElementById('statusToastMsg');
  toast.classList.remove('hidden', 'bg-emerald-50', 'border-emerald-200', 'text-emerald-800', 'bg-rose-50', 'border-rose-200', 'text-rose-800');
  if (isError) {
    toast.classList.add('bg-rose-50', 'border-rose-200', 'text-rose-800');
  } else {
    toast.classList.add('bg-emerald-50', 'border-emerald-200', 'text-emerald-800');
  }
  toastMsg.textContent = msg;
}

function sanitizeForFirestore(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// =========================================================================
// 4. Firestore 讀寫與刪除邏輯（含填空單字同步與頭像保存）
// =========================================================================
async function fetchCloudScripts(selectIdAfterLoad = null) {
  const statusBadge = document.getElementById('cloudStatus');
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy("updatedAt", "desc"));
    let querySnapshot;
    try {
      querySnapshot = await getDocsFromServer(q);
    } catch (serverErr) {
      querySnapshot = await getDocs(q);
    }

    savedScriptsMap.clear();
    const selectEl = document.getElementById('savedScriptsSelect');
    selectEl.innerHTML = '<option value="default">預設範例 (11/13)</option>';

    let firstValidId = null;
    querySnapshot.forEach((docSnap) => {
      if (docSnap.id === '_auth_verify') return;
      const data = { id: docSnap.id, ...docSnap.data() };
      savedScriptsMap.set(docSnap.id, data);
      if (!firstValidId) firstValidId = docSnap.id;

      const opt = document.createElement('option');
      opt.value = docSnap.id;
      opt.textContent = `☁️ ${data.title || '未命名講稿'}`;
      selectEl.appendChild(opt);
    });

    statusBadge.textContent = `🟢 已連線 (${savedScriptsMap.size} 份)`;
    statusBadge.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800";

    if (selectIdAfterLoad && savedScriptsMap.has(selectIdAfterLoad)) {
      selectEl.value = selectIdAfterLoad;
      await loadSelectedScript(selectIdAfterLoad);
    } else if (!selectIdAfterLoad && firstValidId) {
      selectEl.value = firstValidId;
      await loadSelectedScript(firstValidId);
    }
  } catch (err) {
    console.error("Firestore 讀取失敗:", err);
    statusBadge.textContent = "🔴 連線異常";
    statusBadge.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800";
    showToast(`⚠️ 無法讀取 Firestore：${err.message}`, true);
  }
}

window.loadSelectedScript = async function(scriptId) {
  editingTarget = { secIdx: null, itemIdx: null };
  isEditingHeader = false;
  if (scriptId === 'default') {
    currentScript = structuredClone(defaultScriptData);
    applyAdminUiPermissions();
    renderScript(currentScript);
    return;
  }

  const target = savedScriptsMap.get(scriptId);
  if (target) {
    currentScript = structuredClone(target);
    applyAdminUiPermissions();
    if (target.voiceProfile) {
      applySmartVoiceMatch(target.voiceProfile);
    }
    renderScript(currentScript);

    const hasMissingZh = currentScript.sections?.some(sec =>
      sec.items?.some(it => !(it.zh && it.zh.trim()))
    );
    if (hasMissingZh) {
      await autoTranslateMissingChinese(currentScript, true);
    }
  }
};

window.saveScriptToFirestore = async function() {
  if (!isAdminMode) return;

  if (isEditingHeader) {
    window.saveHeaderEdit();
  }
  if (editingTarget.secIdx !== null && editingTarget.itemIdx !== null) {
    await window.saveInlineEdit(editingTarget.secIdx, editingTarget.itemIdx);
  }

  const enteredPassword = adminPasswordSession || await promptAdminPassword(`儲存講稿「${currentScript.title}」至雲端`);
  if (!enteredPassword) return;

  const saveBtn = document.getElementById('saveCloudBtn');
  const originalHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span>⏳</span> 儲存中...';

  let shouldRetry = false;

  try {
    const cleanSections = sanitizeForFirestore(
      currentScript.sections.map((sec, sIdx) => ({
        part: sec.part || 'Part 1',
        titleEn: cleanSubHeadingText(sec.titleEn || ''),
        titleZh: sec.titleZh || '',
        items: (sec.items || []).map((it, iIdx) => {
          if (it.templateEn) {
            const currentFilled = (it.placeholders || []).map((_, pIdx) => {
              const domEl = document.getElementById(`input-${sIdx}-${iIdx}-${pIdx}`);
              if (domEl) return domEl.value.trim();
              return Array.isArray(it.filledValues) ? (it.filledValues[pIdx] || '').trim() : '';
            });
            return {
              templateEn: it.templateEn,
              placeholders: it.placeholders || [],
              filledValues: currentFilled,
              zh: (it.zh || '').trim()
            };
          }
          return {
            en: it.en || '',
            zh: (it.zh || '').trim(),
            isAnswer: Boolean(it.isAnswer)
          };
        })
      }))
    );

    const selectedVoiceName = document.getElementById('voiceSelect').value;
    const chosenVoice = voices.find(v => v.name === selectedVoiceName);
    const voiceProfile = chosenVoice ? {
      name: chosenVoice.name,
      lang: normalizeLangCode(chosenVoice.lang),
      gender: detectVoiceGender(chosenVoice.name)
    } : null;

    const effectiveAvatar = currentScript.avatarUrl || localStorage.getItem(LOCAL_AVATAR_KEY) || '';

    const payload = {
      adminKey: enteredPassword,
      title: currentScript.title || "English Speaking Script",
      meetUrl: currentScript.meetUrl || "",
      avatarUrl: effectiveAvatar,
      voiceProfile,
      sections: cleanSections,
      updatedAt: serverTimestamp()
    };

    let savedId = currentScript.id;
    if (savedId && savedId !== 'default') {
      await setDoc(doc(db, COLLECTION_NAME, savedId), payload, { merge: true });
    } else {
      const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...payload,
        createdAt: serverTimestamp()
      });
      savedId = docRef.id;
      currentScript.id = savedId;
    }

    const verifySnap = await getDocFromServer(doc(db, COLLECTION_NAME, savedId));
    const verifiedData = verifySnap.data();
    const zhCount = (verifiedData?.sections || []).reduce((acc, s) =>
      acc + (s.items || []).filter(i => i.zh && i.zh.trim().length > 0).length, 0
    );

    showToast(`✅ 已成功儲存至雲端「${payload.title}」（含 ${zhCount} 句中文翻譯與填空單字）`);
    await fetchCloudScripts(savedId);
  } catch (err) {
    console.error("Firestore 儲存失敗:", err);
    const isAuthError = err.code === 'permission-denied' ||
      (err.message && (err.message.includes('Missing or insufficient permissions') || err.message.includes('PERMISSION_DENIED')));

    if (isAuthError) {
      setAdminSession("");
      showToast("❌ 管理員密碼已失效或錯誤！資料「沒有儲存成功」，請重新登入後再試。", true);
      shouldRetry = await showErrorAlertModal(
        "密碼錯誤，沒有儲存成功",
        `您輸入的管理員密碼不正確，雲端已拒絕寫入權限。<br><br>⚠️ 目前講稿「<strong>${currentScript.title}</strong>」<span class="text-rose-600 font-bold underline">沒有儲存成功</span>，請重新輸入正確密碼。`,
        true
      );
    } else {
      showToast(`❌ 雲端連線異常，資料「沒有儲存成功」：${err.message}`, true);
      await showErrorAlertModal(
        "儲存失敗，沒有寫入雲端",
        `發生網路或資料庫錯誤，本次講稿<span class="text-rose-600 font-bold underline">沒有儲存成功</span>。<br><br>錯誤原因：${err.message}`,
        false
      );
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHtml;
  }

  if (shouldRetry) {
    await window.handleAdminToggleClick();
    if (isAdminMode) {
      await window.saveScriptToFirestore();
    }
  }
};

window.deleteCurrentCloudScript = async function() {
  if (!isAdminMode) return;
  if (!currentScript.id || currentScript.id === 'default') return;

  const enteredPassword = adminPasswordSession || await promptAdminPassword(`從雲端刪除「${currentScript.title}」`);
  if (!enteredPassword) return;

  let shouldRetry = false;
  const docRef = doc(db, COLLECTION_NAME, currentScript.id);

  try {
    await setDoc(docRef, { adminKey: enteredPassword }, { merge: true });
    await deleteDoc(docRef);

    showToast(`🗑️ 已從雲端刪除：「${currentScript.title}」`);
    currentScript = structuredClone(defaultScriptData);
    document.getElementById('savedScriptsSelect').value = 'default';
    applyAdminUiPermissions();
    renderScript(currentScript);
    await fetchCloudScripts('default');
  } catch (err) {
    console.error("刪除失敗:", err);
    const isAuthError = err.code === 'permission-denied' ||
      (err.message && (err.message.includes('Missing or insufficient permissions') || err.message.includes('PERMISSION_DENIED')));

    if (isAuthError) {
      setAdminSession("");
      showToast("❌ 管理員密碼錯誤！雲端講稿「沒有刪除成功」。", true);
      shouldRetry = await showErrorAlertModal(
        "密碼錯誤，沒有刪除成功",
        `您輸入的管理員密碼不正確，雲端講稿「<strong>${currentScript.title}</strong>」<span class="text-rose-600 font-bold underline">沒有刪除成功</span>。`,
        true
      );
    } else {
      showToast(`❌ 刪除失敗：${err.message}`, true);
    }
  }

  if (shouldRetry) {
    await window.handleAdminToggleClick();
    if (isAdminMode) {
      await window.deleteCurrentCloudScript();
    }
  }
};

// =========================================================================
// 4-1. 可愛插畫風活動資訊標題區（支援插圖上傳壓縮保存、一鍵複製連結與權限控管）
// =========================================================================
function getDefaultCuteAvatarSvg() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fef3c7"/>
          <stop offset="100%" stop-color="#bae6fd"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" fill="url(#bg)"/>
      <circle cx="80" cy="78" r="42" fill="#fde68a"/>
      <path d="M40 72 C40 36, 120 36, 120 72 C115 54, 45 54, 40 72 Z" fill="#5c4033"/>
      <circle cx="65" cy="76" r="4.5" fill="#334155"/>
      <circle cx="95" cy="76" r="4.5" fill="#334155"/>
      <ellipse cx="56" cy="85" rx="6" ry="3.5" fill="#fda4af" opacity="0.7"/>
      <ellipse cx="104" cy="85" rx="6" ry="3.5" fill="#fda4af" opacity="0.7"/>
      <path d="M71 88 Q80 98 89 88" stroke="#e11d48" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M44 148 C48 122, 112 122, 116 148 Z" fill="#1e3a8a"/>
      <text x="124" y="42" font-size="22">✨</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getBannerAvatarSrc(data) {
  if (data?.avatarUrl) return data.avatarUrl;
  const cached = localStorage.getItem(LOCAL_AVATAR_KEY);
  if (cached) return cached;
  return './cute-girl.png';
}

window.triggerAvatarUpload = function() {
  if (!isAdminMode) return;
  let fileInput = document.getElementById('cuteAvatarFileInput');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'cuteAvatarFileInput';
    fileInput.accept = 'image/*';
    fileInput.className = 'hidden';
    fileInput.addEventListener('change', window.handleAvatarFileSelected);
    document.body.appendChild(fileInput);
  }
  fileInput.click();
};

window.handleAvatarFileSelected = function(event) {
  if (!isAdminMode) return;
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 420;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.86);
      currentScript.avatarUrl = compressedDataUrl;
      try {
        localStorage.setItem(LOCAL_AVATAR_KEY, compressedDataUrl);
      } catch (storageErr) {
        console.warn('localStorage 容量限制:', storageErr);
      }

      renderHeaderBanner(currentScript);
      showToast('🎀 已更新可愛標題插圖！點擊右上角「☁️ 儲存雲端」可同步保存。');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
};

window.copyMeetUrl = function(url) {
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    showToast('📋 已複製 Google Meet 連結！');
  }).catch(() => {
    showToast('ℹ️ 請直接點擊連結開啟會議室');
  });
};

window.editDocHeader = function() {
  if (!isAdminMode) return;
  isEditingHeader = true;
  renderHeaderBanner(currentScript);

  setTimeout(() => {
    const titleInput = document.getElementById('editHeaderTitleInput');
    if (titleInput) {
      titleInput.focus();
      const len = titleInput.value.length;
      titleInput.setSelectionRange(len, len);
    }
  }, 20);
};

window.cancelHeaderEdit = function() {
  isEditingHeader = false;
  renderHeaderBanner(currentScript);
};

window.saveHeaderEdit = function() {
  if (!isAdminMode) return;
  const titleInput = document.getElementById('editHeaderTitleInput');
  const meetInput = document.getElementById('editHeaderMeetInput');
  if (!titleInput || !meetInput) return;

  const newTitle = titleInput.value.trim();
  if (!newTitle) {
    titleInput.focus();
    return;
  }

  currentScript.title = newTitle;
  currentScript.meetUrl = meetInput.value.trim();
  isEditingHeader = false;
  renderHeaderBanner(currentScript);
};

window.handleHeaderEditKeydown = function(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    window.saveHeaderEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    window.cancelHeaderEdit();
  }
};

function renderHeaderBanner(data) {
  const bannerCard = document.getElementById('bannerCard');
  if (!bannerCard) return;

  const isCloud = data.id && data.id !== 'default';
  const badgeClass = isCloud
    ? 'inline-flex items-center gap-1 bg-emerald-100/90 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs'
    : 'inline-flex items-center gap-1 bg-amber-100/90 text-amber-800 border border-amber-200 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
  const badgeText = isCloud ? '☁️ 雲端講義' : '📝 本地範本';
  const avatarSrc = getBannerAvatarSrc(data);
  const fallbackSvg = getDefaultCuteAvatarSvg();

  if (isAdminMode && isEditingHeader) {
    bannerCard.innerHTML = `
      <div class="w-full space-y-3 bg-gradient-to-r from-amber-50/90 via-rose-50/70 to-sky-50/90 p-4 sm:p-5 rounded-2xl border-2 border-amber-200 shadow-xs">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <span class="${badgeClass}">${badgeText}</span>
            <span class="text-xs text-sky-700 font-bold">✏️ 編輯講義標題、插圖與連結</span>
          </div>
          <button
            type="button"
            onclick="triggerAvatarUpload()"
            class="px-3 py-1 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold rounded-full shadow-2xs transition"
          >
            🖼️ 更換可愛插圖
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="editHeaderTitleInput" class="block text-xs font-bold text-slate-700 mb-1">
              講義主標題：
            </label>
            <input
              id="editHeaderTitleInput"
              type="text"
              value="${escapeAttr(data.title || '')}"
              onkeydown="handleHeaderEditKeydown(event)"
              placeholder="輸入講義標題..."
              class="en-font w-full px-3.5 py-2 text-lg font-bold text-slate-900 bg-white border-2 border-amber-200 rounded-xl focus:outline-none focus:border-sky-400"
            />
          </div>

          <div>
            <label for="editHeaderMeetInput" class="block text-xs font-bold text-slate-700 mb-1">
              Google Meet 連結（留空則隱藏）：
            </label>
            <input
              id="editHeaderMeetInput"
              type="text"
              value="${escapeAttr(data.meetUrl || '')}"
              onkeydown="handleHeaderEditKeydown(event)"
              placeholder="https://meet.google.com/..."
              class="font-mono w-full px-3.5 py-2 text-sm text-slate-900 bg-white border-2 border-amber-200 rounded-xl focus:outline-none focus:border-sky-400"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onclick="saveHeaderEdit()"
            class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-full shadow-2xs transition"
          >
            ✅ 完成修改
          </button>
          <button
            type="button"
            onclick="cancelHeaderEdit()"
            class="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-full transition"
          >
            ✕ 取消
          </button>
          <span class="text-xs text-slate-400 ml-1">按 Enter 套用 • Esc 取消</span>
        </div>
      </div>
    `;
    return;
  }

  const safeTitle = escapeHtml(data.title || 'English Speaking Script');
  const meetUrl = (data.meetUrl || '').trim();
  const normalizedHref = meetUrl && !/^https?:\/\//i.test(meetUrl) ? `https://${meetUrl}` : meetUrl;
  const displayMeetText = escapeHtml(meetUrl);

  const changeAvatarBtnHtml = isAdminMode
    ? `
      <button
        type="button"
        onclick="triggerAvatarUpload()"
        class="absolute inset-x-1.5 bottom-1.5 py-1 px-2 rounded-xl bg-slate-900/75 hover:bg-slate-900 text-white text-[11px] font-bold opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition flex items-center justify-center gap-1 shadow-xs"
        title="點擊選擇電腦或手機中的可愛圖片"
      >
        <span>🖼️</span>
        <span>換圖片</span>
      </button>
    `
    : '';

  const editHeaderBtnHtml = isAdminMode
    ? `
      <button
        type="button"
        onclick="editDocHeader()"
        class="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-white/80 hover:bg-white border border-amber-200 px-2.5 py-1 rounded-full shadow-2xs transition"
        title="編輯標題與連結"
      >
        <span>✏️</span>
        <span>編輯</span>
      </button>
    `
    : '';

  bannerCard.innerHTML = `
    <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-50/95 via-rose-50/70 to-sky-50/95 border-2 border-amber-200/80 p-4 sm:p-5 shadow-xs">
      <!-- 可愛背景光暈點綴 -->
      <div class="pointer-events-none absolute -right-6 -top-6 w-28 h-28 rounded-full bg-sky-200/30 blur-xl"></div>
      <div class="pointer-events-none absolute right-24 -bottom-8 w-24 h-24 rounded-full bg-amber-200/35 blur-xl"></div>

      <div class="relative flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-5">
        <!-- 左側：可愛動漫女孩圓角相框（僅管理者顯示換圖片） -->
        <div class="relative group shrink-0">
          <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden border-[3px] border-white shadow-md ring-2 ring-amber-300/90 bg-amber-100">
            <img
              src="${escapeAttr(avatarSrc)}"
              onerror="this.onerror=null; this.src='${escapeAttr(fallbackSvg)}';"
              alt="Speaking Club Cute Host"
              class="w-full h-full object-cover object-top transition duration-300 ${isAdminMode ? 'group-hover:scale-105' : ''}"
            />
          </div>
          <span class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-amber-400 text-white text-sm flex items-center justify-center shadow-xs border-2 border-white select-none">
            ✨
          </span>
          ${changeAvatarBtnHtml}
        </div>

        <!-- 右側：活動資訊欄 -->
        <div class="flex-1 min-w-0 w-full text-center sm:text-left">
          <div class="flex flex-wrap items-center justify-center sm:justify-between gap-2 mb-1.5">
            <span class="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/90 border border-amber-200 text-amber-800 text-xs font-extrabold tracking-wide shadow-2xs">
              <span>🎙️</span>
              <span>English Speaking Club</span>
            </span>
            <span id="docSourceBadge" class="${badgeClass}">
              ${badgeText}
            </span>
          </div>

          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 id="docTitle" class="en-font text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
              ${safeTitle}
            </h2>
            ${editHeaderBtnHtml}
          </div>

          ${meetUrl ? `
            <div id="meetLinkBox" class="mt-3 inline-flex flex-wrap items-center justify-center sm:justify-start gap-2 px-3.5 py-2 rounded-xl bg-white/90 border border-sky-200/90 shadow-2xs max-w-full">
              <span class="inline-flex items-center gap-1 text-xs font-extrabold text-sky-800 shrink-0">
                <span>📹</span>
                <span>Google Meet 連結：</span>
              </span>
              <a
                href="${escapeAttr(normalizedHref)}"
                target="_blank"
                class="font-mono text-xs sm:text-sm font-semibold text-sky-700 hover:text-sky-900 underline break-all"
              >
                ${displayMeetText}
              </a>
              <button
                type="button"
                onclick="copyMeetUrl('${escapeAttr(normalizedHref)}')"
                class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 hover:bg-sky-200 text-sky-800 transition shrink-0"
                title="複製會議連結"
              >
                📋 複製
              </button>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// =========================================================================
// 5. 語音合成引擎（標準自然語速）
// =========================================================================
function normalizeLangCode(lang) {
  return (lang || 'en-US').replace('_', '-');
}

function getAccentBadge(lang) {
  const code = normalizeLangCode(lang).toLowerCase();
  if (code.includes('us')) return '🇺🇸 美式';
  if (code.includes('gb') || code.includes('uk')) return '🇬🇧 英式';
  if (code.includes('au')) return '🇦🇺 澳式';
  if (code.includes('ca')) return '🇨🇦 加式';
  if (code.includes('in')) return '🇮🇳 印度';
  return '🌐 英語';
}

function detectVoiceGender(name) {
  const n = (name || '').toLowerCase();
  if (/(steffan|guy|christopher|eric|roger|andrew|brian|aaron|alex|daniel|arthur|oliver|thomas|fred|male|man)/.test(n)) {
    return 'male';
  }
  if (/(aria|jenny|ava|emma|michelle|ana|samantha|victoria|karen|moira|tessa|serena|kate|allison|susan|female|woman)/.test(n)) {
    return 'female';
  }
  return 'neutral';
}

function formatVoiceDisplayName(voice) {
  const accent = getAccentBadge(voice.lang);
  let cleanName = voice.name
    .replace(/Microsoft |Google |Apple |Android Speech Recognition and Synthesis from Google /gi, '')
    .replace(/Online \(Natural\)/gi, '自然語調')
    .replace(/\(United States\)|\(United Kingdom\)|\(Australia\)|English /gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanName || cleanName.toLowerCase() === 'us' || cleanName.toLowerCase() === 'uk') {
    cleanName = '標準語調';
  }
  return `${accent} • ${cleanName}`;
}

window.handleVoiceChange = function(voiceName) {
  const chosen = voices.find(v => v.name === voiceName);
  if (chosen) {
    localStorage.setItem('speaking_club_voice_profile', JSON.stringify({
      name: chosen.name,
      lang: normalizeLangCode(chosen.lang),
      gender: detectVoiceGender(chosen.name)
    }));
  }
};

function applySmartVoiceMatch(profile) {
  if (!profile || voices.length === 0) return;
  const voiceSelect = document.getElementById('voiceSelect');
  const enVoices = voices.filter(v => normalizeLangCode(v.lang).toLowerCase().startsWith('en'));
  if (enVoices.length === 0) return;

  const exactMatch = enVoices.find(v => v.name === profile.name);
  if (exactMatch) {
    voiceSelect.value = exactMatch.name;
    return;
  }

  const sameLangAndGender = enVoices.find(v =>
    normalizeLangCode(v.lang).toLowerCase() === (profile.lang || 'en-us').toLowerCase() &&
    detectVoiceGender(v.name) === profile.gender
  );
  if (sameLangAndGender) {
    voiceSelect.value = sameLangAndGender.name;
    return;
  }

  const sameLang = enVoices.find(v =>
    normalizeLangCode(v.lang).toLowerCase() === (profile.lang || 'en-us').toLowerCase()
  );
  if (sameLang) {
    voiceSelect.value = sameLang.name;
  }
}

function loadVoices() {
  const rawVoices = window.speechSynthesis.getVoices();
  if (!rawVoices || rawVoices.length === 0) return false;

  voices = rawVoices;
  const voiceSelect = document.getElementById('voiceSelect');
  const enVoices = voices.filter(v => normalizeLangCode(v.lang).toLowerCase().startsWith('en'));
  if (enVoices.length === 0) return false;

  enVoices.sort((a, b) => {
    const aUs = normalizeLangCode(a.lang).toLowerCase() === 'en-us' ? 0 : 1;
    const bUs = normalizeLangCode(b.lang).toLowerCase() === 'en-us' ? 0 : 1;
    if (aUs !== bUs) return aUs - bUs;
    const aNat = /natural|google|samantha|ava|aria|steffan/i.test(a.name) ? 0 : 1;
    const bNat = /natural|google|samantha|ava|aria|steffan/i.test(b.name) ? 0 : 1;
    return aNat - bNat;
  });

  const previousValue = voiceSelect.value;
  voiceSelect.innerHTML = '';

  enVoices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = formatVoiceDisplayName(voice);
    voiceSelect.appendChild(option);
  });

  const savedProfileRaw = localStorage.getItem('speaking_club_voice_profile');
  if (currentScript?.voiceProfile) {
    applySmartVoiceMatch(currentScript.voiceProfile);
  } else if (savedProfileRaw) {
    try {
      applySmartVoiceMatch(JSON.parse(savedProfileRaw));
    } catch (e) {}
  } else if (previousValue && enVoices.some(v => v.name === previousValue)) {
    voiceSelect.value = previousValue;
  } else {
    voiceSelect.selectedIndex = 0;
  }

  return true;
}

window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();
let voiceRetryCount = 0;
const voicePollTimer = setInterval(() => {
  voiceRetryCount++;
  if (loadVoices() || voiceRetryCount >= 12) {
    clearInterval(voicePollTimer);
  }
}, 300);

window.speakText = function(text, elementId = null, onEndCallback = null) {
  window.speechSynthesis.cancel();
  document.querySelectorAll('.speaking-active').forEach(el => el.classList.remove('speaking-active'));

  if (elementId) {
    const el = document.getElementById(elementId);
    if (el) el.classList.add('speaking-active');
  }

  const cleanSpeech = text.replace(/^Ex:\s*/i, 'Example: ').replace(/\n+/g, '. ');
  const utterance = new SpeechSynthesisUtterance(cleanSpeech);
  const selectedVoiceName = document.getElementById('voiceSelect').value;
  const chosenVoice = voices.find(v => v.name === selectedVoiceName);
  if (chosenVoice) {
    utterance.voice = chosenVoice;
    utterance.lang = normalizeLangCode(chosenVoice.lang);
  } else {
    utterance.lang = 'en-US';
  }
  utterance.rate = 1.0;

  utterance.onend = () => {
    if (elementId) {
      const el = document.getElementById(elementId);
      if (el) el.classList.remove('speaking-active');
    }
    if (onEndCallback) onEndCallback();
  };

  window.speechSynthesis.speak(utterance);
};

window.speakTemplate = function(secIdx, itemIdx) {
  const item = currentScript.sections[secIdx].items[itemIdx];
  const fullSentence = buildFilledSentenceText(item);
  window.speakText(fullSentence, `row-${secIdx}-${itemIdx}`);
};

window.togglePlayAll = function() {
  const btn = document.getElementById('playAllBtn');
  if (isPlayingAll) {
    isPlayingAll = false;
    window.speechSynthesis.cancel();
    document.querySelectorAll('.speaking-active').forEach(el => el.classList.remove('speaking-active'));
    btn.innerHTML = '<span>▶️</span> 連續播放';
    return;
  }

  const allSentences = [];
  currentScript.sections.forEach((sec, sIdx) => {
    const cleanSecTitle = cleanSubHeadingText(sec.titleEn);
    allSentences.push({ text: `${sec.part}. ${cleanSecTitle}`, id: null });
    sec.items.forEach((item, iIdx) => {
      if (item.en) {
        allSentences.push({ text: item.en, id: `row-${sIdx}-${iIdx}` });
      } else if (item.templateEn) {
        allSentences.push({ text: buildFilledSentenceText(item), id: `row-${sIdx}-${iIdx}` });
      }
    });
  });

  isPlayingAll = true;
  playQueueIndex = 0;
  btn.innerHTML = '<span>⏹️</span> 停止播放';

  function playNext() {
    if (!isPlayingAll || playQueueIndex >= allSentences.length) {
      isPlayingAll = false;
      btn.innerHTML = '<span>▶️</span> 連續播放';
      return;
    }
    const current = allSentences[playQueueIndex++];
    window.speakText(current.text, current.id, () => {
      setTimeout(playNext, 450);
    });
  }
  playNext();
};

// =========================================================================
// 6. 空白欄位輸入（自動依內容延展不截斷）、自動翻譯、查字典、多行原地編輯與刪除
// =========================================================================
window.autoResizeTextarea = function(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(el.scrollHeight, 56)}px`;
};

window.handleBlankInput = function(secIdx, itemIdx, pIdx, value) {
  const item = currentScript.sections[secIdx]?.items[itemIdx];
  if (!item) return;
  if (!Array.isArray(item.filledValues)) {
    item.filledValues = Array(item.placeholders.length).fill('');
  }
  item.filledValues[pIdx] = value;

  const mirrorEl = document.getElementById(`mirror-${secIdx}-${itemIdx}-${pIdx}`);
  if (mirrorEl) {
    mirrorEl.textContent = value || item.placeholders[pIdx] || '輸入單字';
  }

  const lookupBtn = document.getElementById(`lookup-btn-${secIdx}-${itemIdx}-${pIdx}`);
  if (lookupBtn) {
    const targetWord = extractEnglishWord(value) || extractEnglishWord(item.placeholders[pIdx]);
    lookupBtn.title = targetWord ? `查詢「${targetWord}」英漢字典` : '查詢英漢字典';
  }
};

window.translateFilledSentence = async function(secIdx, itemIdx) {
  const item = currentScript.sections[secIdx]?.items[itemIdx];
  if (!item || !item.templateEn) return;

  const zhSpan = document.getElementById(`zh-text-${secIdx}-${itemIdx}`);

  if (!hasAnyFilledBlank(item)) {
    const templateStr = item.templateEn.join(' [___] ').replace(/[^\S\n]+/g, ' ').trim();
    const defaultZh = await translateEnToZhTW(templateStr);
    if (defaultZh) {
      item.zh = `${defaultZh}（填入單字後自動翻譯）`;
      if (zhSpan) zhSpan.textContent = item.zh;
    }
    return;
  }

  const fullSentence = buildFilledSentenceText(item);
  if (zhSpan) zhSpan.textContent = '⏳ 正在翻譯填入單字後的句子...';

  const zh = await translateEnToZhTW(fullSentence);
  if (zh) {
    item.zh = zh;
    if (zhSpan) zhSpan.textContent = zh;
  }
};

window.handleBlankKeydown = function(event, secIdx, itemIdx) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.target.blur();
  }
};

window.lookupBlankWord = function(secIdx, itemIdx, pIdx) {
  const item = currentScript.sections[secIdx]?.items[itemIdx];
  const inputEl = document.getElementById(`input-${secIdx}-${itemIdx}-${pIdx}`);
  const typedVal = inputEl ? inputEl.value.trim() : '';
  const fallbackVal = item?.placeholders?.[pIdx] || '';
  const targetWord = extractEnglishWord(typedVal) || extractEnglishWord(fallbackVal);
  if (targetWord) {
    window.openDictionaryModal(targetWord);
  }
};

window.mergeWithPrevious = async function(secIdx, itemIdx) {
  if (!isAdminMode || itemIdx <= 0) return;
  editingTarget = { secIdx: null, itemIdx: null };
  const items = currentScript.sections[secIdx].items;
  const prev = items[itemIdx - 1];
  const curr = items[itemIdx];

  const prevText = prev.templateEn ? prev.templateEn.join('___') : prev.en;
  const currText = curr.templateEn ? curr.templateEn.join('___') : curr.en;

  const mergedEn = `${prevText}\n${currText}`.trim();
  const mergedZh = [prev.zh, curr.zh].filter(Boolean).join('\n');

  items[itemIdx - 1] = buildSentenceItem(mergedEn, mergedZh, false);
  items.splice(itemIdx, 1);
  renderScript(currentScript);
  if (!mergedZh) {
    await autoTranslateMissingChinese(currentScript, true);
  }
};

window.deleteSentence = function(secIdx, itemIdx) {
  if (!isAdminMode) return;
  const sec = currentScript.sections[secIdx];
  if (!sec || !Array.isArray(sec.items)) return;

  sec.items.splice(itemIdx, 1);
  if (sec.items.length === 0 && currentScript.sections.length > 1) {
    currentScript.sections.splice(secIdx, 1);
  }

  editingTarget = { secIdx: null, itemIdx: null };
  renderScript(currentScript);
  showToast('🗑️ 已刪除該文字框（如需同步至雲端，請點擊右上角「☁️ 儲存雲端」）');
};

window.editSentence = function(secIdx, itemIdx) {
  if (!isAdminMode) return;
  editingTarget = { secIdx, itemIdx };
  renderScript(currentScript);

  setTimeout(() => {
    const enInput = document.getElementById(`edit-en-${secIdx}-${itemIdx}`);
    const zhInput = document.getElementById(`edit-zh-${secIdx}-${itemIdx}`);
    window.autoResizeTextarea(enInput);
    window.autoResizeTextarea(zhInput);
    if (enInput) {
      enInput.focus();
      const len = enInput.value.length;
      enInput.setSelectionRange(len, len);
    }
  }, 20);
};

window.cancelInlineEdit = function() {
  editingTarget = { secIdx: null, itemIdx: null };
  renderScript(currentScript);
};

window.saveInlineEdit = async function(secIdx, itemIdx) {
  if (!isAdminMode) return;
  const enInput = document.getElementById(`edit-en-${secIdx}-${itemIdx}`);
  const zhInput = document.getElementById(`edit-zh-${secIdx}-${itemIdx}`);
  if (!enInput || !zhInput) return;

  const item = currentScript.sections[secIdx].items[itemIdx];
  const newEn = enInput.value.replace(/\r\n/g, '\n').trim();
  const newZh = zhInput.value.replace(/\r\n/g, '\n').trim();

  if (!newEn) {
    enInput.focus();
    return;
  }

  currentScript.sections[secIdx].items[itemIdx] = buildSentenceItem(newEn, newZh, item.isAnswer);
  editingTarget = { secIdx: null, itemIdx: null };
  renderScript(currentScript);

  if (!newZh) {
    await autoTranslateMissingChinese(currentScript, true);
  }
};

window.splitMultilineIntoItems = async function(secIdx, itemIdx) {
  if (!isAdminMode) return;
  const enInput = document.getElementById(`edit-en-${secIdx}-${itemIdx}`);
  const zhInput = document.getElementById(`edit-zh-${secIdx}-${itemIdx}`);
  if (!enInput || !zhInput) return;

  const enLines = enInput.value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (enLines.length <= 1) {
    showToast('ℹ️ 請先按 Enter 將英文分成兩行以上，再點擊「拆成兩句」喔！', true);
    enInput.focus();
    return;
  }

  const zhLines = zhInput.value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(s => s.trim());

  const newItems = enLines.map((lineEn, idx) =>
    buildSentenceItem(lineEn, zhLines[idx] || '', false)
  );

  currentScript.sections[secIdx].items.splice(itemIdx, 1, ...newItems);
  editingTarget = { secIdx: null, itemIdx: null };
  renderScript(currentScript);
  await autoTranslateMissingChinese(currentScript, true);
};

window.previewInlineEdit = function(secIdx, itemIdx, rowId) {
  const enInput = document.getElementById(`edit-en-${secIdx}-${itemIdx}`);
  const rawEn = enInput ? enInput.value.trim() : '';
  if (!rawEn) return;
  const previewText = rawEn.replace(/___/g, 'something');
  window.speakText(previewText, rowId);
};

window.handleInlineEditKeydown = function(event, secIdx, itemIdx) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    window.saveInlineEdit(secIdx, itemIdx);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    window.cancelInlineEdit();
  }
};

// =========================================================================
// 7. 講義排版渲染（Part 為主標題大橫幅，Step 為縮排次標題小標，非管理者僅見朗讀與複製）
// =========================================================================
function isStepSubSection(sec) {
  return /^Step\s*\d+/i.test((sec?.part || '').trim());
}

function getPartVisualTheme(sec, partRankIdx) {
  const themes = [
    {
      headerBox: 'bg-sky-50/95 border border-sky-200 border-l-4 border-l-sky-600',
      partPill: 'bg-sky-600 text-white shadow-2xs',
      titleColor: 'text-sky-950',
      zhColor: 'text-sky-700',
      speakBtn: 'bg-white hover:bg-sky-100 text-sky-700 border-sky-200',
      stepDot: 'bg-sky-500',
      stepPill: 'bg-sky-100 text-sky-800 border-sky-200',
      stepTitleColor: 'text-slate-800',
      stepZhColor: 'text-sky-700/90'
    },
    {
      headerBox: 'bg-amber-50/95 border border-amber-200 border-l-4 border-l-amber-500',
      partPill: 'bg-amber-500 text-white shadow-2xs',
      titleColor: 'text-amber-950',
      zhColor: 'text-amber-700',
      speakBtn: 'bg-white hover:bg-amber-100 text-amber-800 border-amber-200',
      stepDot: 'bg-amber-500',
      stepPill: 'bg-amber-100 text-amber-900 border-amber-200',
      stepTitleColor: 'text-slate-800',
      stepZhColor: 'text-amber-700/90'
    },
    {
      headerBox: 'bg-emerald-50/95 border border-emerald-200 border-l-4 border-l-emerald-600',
      partPill: 'bg-emerald-600 text-white shadow-2xs',
      titleColor: 'text-emerald-950',
      zhColor: 'text-emerald-700',
      speakBtn: 'bg-white hover:bg-emerald-100 text-emerald-700 border-emerald-200',
      stepDot: 'bg-emerald-500',
      stepPill: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      stepTitleColor: 'text-slate-800',
      stepZhColor: 'text-emerald-700/90'
    },
    {
      headerBox: 'bg-purple-50/95 border border-purple-200 border-l-4 border-l-purple-600',
      partPill: 'bg-purple-600 text-white shadow-2xs',
      titleColor: 'text-purple-950',
      zhColor: 'text-purple-700',
      speakBtn: 'bg-white hover:bg-purple-100 text-purple-700 border-purple-200',
      stepDot: 'bg-purple-500',
      stepPill: 'bg-purple-100 text-purple-800 border-purple-200',
      stepTitleColor: 'text-slate-800',
      stepZhColor: 'text-purple-700/90'
    },
    {
      headerBox: 'bg-rose-50/95 border border-rose-200 border-l-4 border-l-rose-500',
      partPill: 'bg-rose-500 text-white shadow-2xs',
      titleColor: 'text-rose-950',
      zhColor: 'text-rose-700',
      speakBtn: 'bg-white hover:bg-rose-100 text-rose-700 border-rose-200',
      stepDot: 'bg-rose-500',
      stepPill: 'bg-rose-100 text-rose-800 border-rose-200',
      stepTitleColor: 'text-slate-800',
      stepZhColor: 'text-rose-700/90'
    },
    {
      headerBox: 'bg-indigo-50/95 border border-indigo-200 border-l-4 border-l-indigo-600',
      partPill: 'bg-indigo-600 text-white shadow-2xs',
      titleColor: 'text-indigo-950',
      zhColor: 'text-indigo-700',
      speakBtn: 'bg-white hover:bg-indigo-100 text-indigo-700 border-indigo-200',
      stepDot: 'bg-indigo-500',
      stepPill: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      stepTitleColor: 'text-slate-800',
      stepZhColor: 'text-indigo-700/90'
    }
  ];

  const fallbackEmojis = ['👋', '🎯', '🌟', '🎲', '🎨', '🚀'];
  const combinedTitle = `${sec.titleEn || ''} ${sec.titleZh || ''}`.toLowerCase();

  let emoji = fallbackEmojis[partRankIdx % fallbackEmojis.length];
  if (/know each other|friend|introduce|meet|hello|greeting|認識/.test(combinedTitle)) {
    emoji = '👋';
  } else if (/mystery|guess|detective|clue|who|what is it|猜/.test(combinedTitle)) {
    emoji = '🕵️';
  } else if (/dinner|food|eat|drink|cook|menu|meal|餐|吃|食物/.test(combinedTitle)) {
    emoji = '🍽️';
  } else if (/bingo|number|count|math|數字|賓果/.test(combinedTitle)) {
    emoji = '🎲';
  } else if (/travel|trip|place|world|country|旅遊|地方/.test(combinedTitle)) {
    emoji = '✈️';
  } else if (/animal|pet|zoo|動物|寵物/.test(combinedTitle)) {
    emoji = '🐾';
  } else if (/draw|art|color|picture|畫|顏色/.test(combinedTitle)) {
    emoji = '🎨';
  } else if (/music|song|sing|movie|音樂|電影/.test(combinedTitle)) {
    emoji = '🎵';
  } else if (/game|challenge|play|fun|遊戲|挑戰/.test(combinedTitle)) {
    emoji = '🏆';
  }

  return {
    ...themes[partRankIdx % themes.length],
    emoji
  };
}

function renderScript(data) {
  currentScript = data;
  renderHeaderBanner(data);

  const container = document.getElementById('scriptContainer');
  container.innerHTML = '';

  let partCounter = -1;
  let activeParentTheme = getPartVisualTheme(data.sections[0] || {}, 0);

  data.sections.forEach((sec, sIdx) => {
    const isStep = isStepSubSection(sec);

    if (!isStep) {
      partCounter++;
      activeParentTheme = getPartVisualTheme(sec, partCounter);
    }

    const theme = activeParentTheme;
    const cleanTitleEn = cleanSubHeadingText(sec.titleEn);

    const sectionEl = document.createElement('section');
    sectionEl.className = isStep
      ? 'pdf-section ml-2 sm:ml-5 -mt-4 pt-1'
      : 'pdf-section';

    let itemsHtml = sec.items.map((item, iIdx) => {
      const rowId = `row-${sIdx}-${iIdx}`;
      const isEditingThisRow = isAdminMode && editingTarget.secIdx === sIdx && editingTarget.itemIdx === iIdx;

      if (isEditingThisRow) {
        const rawEn = item.templateEn ? item.templateEn.join('___') : (item.en || '');
        const rawZh = item.zh || '';

        return `
          <div id="${rowId}" class="p-3.5 rounded-lg bg-slate-50 border border-sky-400 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div class="flex-1 space-y-2.5">
              <div>
                <label class="block text-[11px] font-bold text-slate-700 mb-1">
                  英文句子（按 <kbd class="px-1 py-0.5 bg-white border border-slate-300 rounded text-[10px]">Enter</kbd> 可換到下一行繼續輸入；輸入 <code class="bg-slate-200 px-1 rounded">___</code> 可轉為填空欄位）
                </label>
                <textarea
                  id="edit-en-${sIdx}-${iIdx}"
                  rows="2"
                  oninput="autoResizeTextarea(this)"
                  onkeydown="handleInlineEditKeydown(event, ${sIdx}, ${iIdx})"
                  placeholder="輸入英文句子，按 Enter 可換到下一行..."
                  class="en-font w-full px-3 py-2 text-sm sm:text-base font-medium text-slate-900 bg-white border border-slate-300 rounded-lg leading-relaxed resize-y focus:outline-none focus:border-sky-500"
                >${escapeHtml(rawEn)}</textarea>
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-1">
                  中文翻譯（按 <kbd class="px-1 py-0.5 bg-white border border-slate-300 rounded text-[10px]">Enter</kbd> 可換行；留空按完成會自動翻譯成繁體中文）
                </label>
                <textarea
                  id="edit-zh-${sIdx}-${iIdx}"
                  rows="2"
                  oninput="autoResizeTextarea(this)"
                  onkeydown="handleInlineEditKeydown(event, ${sIdx}, ${iIdx})"
                  placeholder="輸入中文或留空自動翻譯..."
                  class="w-full px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg leading-relaxed resize-y focus:outline-none focus:border-sky-500"
                >${escapeHtml(rawZh)}</textarea>
              </div>
              <div class="flex flex-wrap items-center gap-2 pt-0.5">
                <button type="button" onclick="saveInlineEdit(${sIdx}, ${iIdx})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition">
                  ✅ 完成
                </button>
                <button type="button" onclick="splitMultilineIntoItems(${sIdx}, ${iIdx})" class="px-2.5 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 text-xs font-bold rounded-lg transition" title="將換行後的每一行拆成獨立句子">
                  ✂️ 拆成兩句
                </button>
                <button type="button" onclick="deleteSentence(${sIdx}, ${iIdx})" class="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition" title="刪除此文字框">
                  🗑️ 刪除
                </button>
                <button type="button" onclick="cancelInlineEdit()" class="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition">
                  ✕ 取消
                </button>
                <span class="text-[11px] text-slate-400">Enter 換行 • Ctrl+Enter 完成 • Esc 取消</span>
              </div>
            </div>
            <div class="shrink-0 self-start">
              <button type="button" onclick="previewInlineEdit(${sIdx}, ${iIdx}, '${rowId}')" class="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition">
                🔊 試聽
              </button>
            </div>
          </div>
        `;
      }

      // 僅管理者模式才顯示合併、編輯與刪除按鈕；非管理者僅看到朗讀按鈕
      const subtleActions = isAdminMode
        ? `
          <div class="flex items-center gap-1 shrink-0">
            ${iIdx > 0 ? `<button onclick="mergeWithPrevious(${sIdx}, ${iIdx})" class="text-[11px] px-1.5 py-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="與上一句合併">⬆️</button>` : ''}
            <button onclick="editSentence(${sIdx}, ${iIdx})" class="text-xs px-1.5 py-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="編輯此句">✏️</button>
            <button onclick="deleteSentence(${sIdx}, ${iIdx})" class="text-xs px-1.5 py-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition" title="刪除此文字框">🗑️</button>
          </div>
        `
        : '';

      // 填空題型
      if (item.templateEn) {
        const filledVals = Array.isArray(item.filledValues) ? item.filledValues : [];
        let sentenceHtml = '';
        item.templateEn.forEach((part, pIdx) => {
          const lineSegments = String(part).split('\n');
          lineSegments.forEach((seg, segIdx) => {
            if (segIdx > 0) {
              sentenceHtml += `<span class="basis-full h-0"></span>`;
            }
            if (seg) {
              sentenceHtml += `<span>${escapeHtml(seg)}</span>`;
            }
          });

          if (pIdx < item.placeholders.length) {
            const curVal = filledVals[pIdx] || '';
            const hintWord = curVal || item.placeholders[pIdx];
            const mirrorDisplay = curVal || item.placeholders[pIdx] || '輸入單字';
            sentenceHtml += `
              <span class="inline-flex items-center max-w-full mx-1 my-0.5 border-b-2 border-slate-700 bg-sky-50/60 px-1 rounded-t-xs">
                <span class="inline-grid items-center max-w-full">
                  <span
                    id="mirror-${sIdx}-${iIdx}-${pIdx}"
                    aria-hidden="true"
                    class="invisible whitespace-pre col-start-1 row-start-1 px-2 py-0.5 text-sm sm:text-base font-semibold pointer-events-none"
                  >${escapeHtml(mirrorDisplay)}</span>
                  <input
                    id="input-${sIdx}-${iIdx}-${pIdx}"
                    type="text"
                    value="${escapeAttr(curVal)}"
                    placeholder="${escapeAttr(item.placeholders[pIdx])}"
                    oninput="handleBlankInput(${sIdx}, ${iIdx}, ${pIdx}, this.value)"
                    onblur="translateFilledSentence(${sIdx}, ${iIdx})"
                    onkeydown="handleBlankKeydown(event, ${sIdx}, ${iIdx})"
                    class="blank-word-input col-start-1 row-start-1 w-full min-w-[5.5rem] px-2 py-0.5 text-center text-sm sm:text-base font-semibold text-sky-900 bg-transparent focus:outline-none"
                  />
                </span>
                <button
                  id="lookup-btn-${sIdx}-${iIdx}-${pIdx}"
                  type="button"
                  onclick="lookupBlankWord(${sIdx}, ${iIdx}, ${pIdx})"
                  class="text-xs px-1 py-0.5 text-amber-600 hover:text-amber-800 transition shrink-0"
                  title="查詢「${escapeAttr(hintWord)}」英漢字典"
                >📖</button>
              </span>
            `;
          }
        });

        return `
          <div id="${rowId}" class="group py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50/90 flex items-start justify-between gap-3 transition">
            <div class="flex items-start gap-2.5 flex-1 min-w-0">
              <span class="text-slate-400 select-none mt-1 text-xs">•</span>
              <div class="flex-1 min-w-0">
                <div class="en-font text-[15px] sm:text-base text-slate-800 leading-relaxed flex flex-wrap items-center">
                  ${sentenceHtml}
                </div>
                <div id="zh-text-${sIdx}-${iIdx}" class="text-xs text-slate-500 mt-0.5 leading-snug whitespace-pre-line">${escapeHtml(item.zh || '⏳ 準備翻譯中文...')}</div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0 pt-0.5">
              <button onclick="speakTemplate(${sIdx}, ${iIdx})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold rounded-md transition" title="朗讀句子">
                🔊 朗讀
              </button>
              ${subtleActions}
            </div>
          </div>
        `;
      }

      // 解答提示句
      if (item.isAnswer) {
        const safeText = item.en.replace(/'/g, "\\'").replace(/\n/g, ' ');
        return `
          <div id="${rowId}" class="group py-2 px-3 -mx-3 rounded-lg hover:bg-slate-50/90 flex items-start justify-between gap-3 transition">
            <div class="flex items-start gap-2.5 flex-1 min-w-0">
              <span class="text-emerald-600 select-none mt-1 text-xs">▸</span>
              <div class="flex items-center gap-2.5 flex-wrap">
                <button onclick="this.nextElementSibling.classList.toggle('blur-sm')" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-bold transition">
                  👀 揭曉答案
                </button>
                <div class="blur-sm transition duration-200 select-none">
                  <span class="en-font text-[15px] sm:text-base font-bold text-emerald-800 whitespace-pre-line">${escapeHtml(item.en)}</span>
                  ${item.zh ? `<span class="text-xs text-slate-500 ml-2 whitespace-pre-line">${escapeHtml(item.zh)}</span>` : ''}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0 pt-0.5">
              <button onclick="speakText('${safeText}', '${rowId}')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-md transition" title="朗讀答案">
                🔊 朗讀
              </button>
              ${subtleActions}
            </div>
          </div>
        `;
      }

      // 一般講義例句
      const safeText = item.en.replace(/'/g, "\\'").replace(/\n/g, ' ');
      return `
        <div id="${rowId}" class="group py-1.5 px-3 -mx-3 rounded-lg hover:bg-slate-50/90 flex items-start justify-between gap-3 transition">
          <div class="flex items-start gap-2.5 flex-1 min-w-0">
            <span class="text-slate-400 select-none mt-1 text-xs">•</span>
            <div class="flex-1 min-w-0">
              <div class="en-font text-[15px] sm:text-base text-slate-800 leading-relaxed whitespace-pre-line">${escapeHtml(item.en)}</div>
              ${item.zh ? `<div class="text-xs text-slate-500 mt-0.5 leading-snug whitespace-pre-line">${escapeHtml(item.zh)}</div>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-1 shrink-0 pt-0.5">
            <button onclick="speakText('${safeText}', '${rowId}')" class="px-2 py-1 bg-slate-100 hover:bg-sky-100 text-slate-700 hover:text-sky-800 text-xs font-bold rounded-md transition" title="朗讀此句">
              🔊 朗讀
            </button>
            ${subtleActions}
          </div>
        </div>
      `;
    }).join('');

    if (isStep) {
      const stepZhSubtitle = sec.titleZh && sec.titleZh !== '口說練習段落'
        ? `<span class="${theme.stepZhColor} font-medium text-xs sm:text-sm ml-1.5">（${escapeHtml(sec.titleZh)}）</span>`
        : '';

      sectionEl.innerHTML = `
        <div class="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-dashed border-slate-300">
          <div class="flex flex-wrap items-center gap-2 min-w-0">
            <span class="w-2 h-2 rounded-full ${theme.stepDot} shrink-0"></span>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-bold tracking-wide ${theme.stepPill} shrink-0">
              <span>👣</span>
              <span>${escapeHtml(sec.part)}</span>
            </span>
            <h4 class="en-font text-base sm:text-lg font-bold ${theme.stepTitleColor} leading-snug">
              <span>${escapeHtml(cleanTitleEn)}</span>
              ${stepZhSubtitle}
            </h4>
          </div>
          <button onclick="speakText('${cleanTitleEn.replace(/'/g, "\\'")}', null)" class="text-[11px] text-slate-400 hover:text-sky-700 px-2 py-0.5 rounded hover:bg-slate-100 font-medium transition shrink-0" title="朗讀步驟標題">
            🔊 唸步驟
          </button>
        </div>
        <div class="divide-y divide-slate-100 pl-3 sm:pl-4">
          ${itemsHtml}
        </div>
      `;
    } else {
      const partZhSubtitle = sec.titleZh && sec.titleZh !== '口說練習段落'
        ? `<span class="${theme.zhColor} font-semibold text-base sm:text-lg ml-1.5">（${escapeHtml(sec.titleZh)}）</span>`
        : '';

      sectionEl.innerHTML = `
        <div class="flex items-center justify-between gap-3 px-4 py-3 mb-3 rounded-xl ${theme.headerBox}">
          <div class="flex flex-wrap items-center gap-2.5 min-w-0">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm sm:text-base font-extrabold tracking-wide ${theme.partPill} shrink-0">
              <span class="text-base sm:text-lg leading-none">${theme.emoji}</span>
              <span>${escapeHtml(sec.part)}</span>
            </span>
            <h3 class="en-font text-xl sm:text-2xl font-extrabold ${theme.titleColor} tracking-tight leading-snug">
              <span>${escapeHtml(cleanTitleEn)}</span>
              ${partZhSubtitle}
            </h3>
          </div>
          <button onclick="speakText('${cleanTitleEn.replace(/'/g, "\\'")}', null)" class="text-xs px-2.5 py-1.5 rounded-lg border font-bold transition shrink-0 ${theme.speakBtn}" title="朗讀段落標題">
            🔊 唸標題
          </button>
        </div>
        <div class="divide-y divide-slate-100 pl-1">
          ${itemsHtml}
        </div>
      `;
    }

    container.appendChild(sectionEl);
  });
}

// =========================================================================
// 8. PDF 座標級解析、跨行斷句與自動中譯（僅限管理者操作）
// =========================================================================
window.handlePdfUpload = async function(event) {
  if (!isAdminMode) {
    event.target.value = '';
    return;
  }

  const file = event.target.files[0];
  if (!file) return;

  editingTarget = { secIdx: null, itemIdx: null };
  isEditingHeader = false;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let reconstructedLines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const items = content.items
      .filter(it => it.str.trim().length > 0)
      .map(it => ({
        str: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width || (it.str.length * 6)
      }));

    items.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 6) return b.y - a.y;
      return a.x - b.x;
    });

    const visualRows = [];
    items.forEach(item => {
      const lastRow = visualRows[visualRows.length - 1];
      if (lastRow && Math.abs(lastRow.y - item.y) <= 6) {
        lastRow.items.push(item);
      } else {
        visualRows.push({ y: item.y, items: [item] });
      }
    });

    visualRows.forEach(row => {
      row.items.sort((a, b) => a.x - b.x);
      let lineStr = '';
      row.items.forEach((it, idx) => {
        if (idx === 0) {
          lineStr += it.str;
        } else {
          const prev = row.items[idx - 1];
          const gap = it.x - (prev.x + prev.w);
          if (gap > 28 && /[a-zA-Z0-9]$/.test(prev.str.trim()) && /^[a-zA-Z0-9]/.test(it.str.trim())) {
            lineStr += ' ___ ' + it.str;
          } else if (gap > 4) {
            lineStr += ' ' + it.str;
          } else {
            lineStr += it.str;
          }
        }
      });
      reconstructedLines.push(lineStr.trim());
    });
  }

  const parsedData = parseLinesToCoherentScript(reconstructedLines, file.name.replace(/\.pdf$/i, ''));
  parsedData.id = null;
  parsedData.avatarUrl = currentScript.avatarUrl || localStorage.getItem(LOCAL_AVATAR_KEY) || '';
  applyAdminUiPermissions();
  renderScript(parsedData);

  event.target.value = '';

  const translatedCount = await autoTranslateMissingChinese(currentScript, true);
  if (translatedCount === 0) {
    showToast(`📄 已匯入「${file.name}」！確認句型無誤後，請點擊右上角「☁️ 儲存雲端」保存。`);
  }
};

function buildSentenceItem(enText, zhText, isAnswer = false) {
  let cleanEn = enText
    .replace(/\r\n/g, '\n')
    .replace(/_{2,}/g, '___')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();

  if (!cleanEn.includes('___') && /\b(I like|I don't like|I have|My favorite is|It is a|This is a)$/i.test(cleanEn)) {
    cleanEn += ' ___';
  }

  if (cleanEn.includes('___')) {
    const parts = cleanEn.split('___');
    if (parts[parts.length - 1].trim() === '') {
      parts[parts.length - 1] = '.';
    }
    const placeholders = Array(parts.length - 1).fill('輸入單字');
    return {
      templateEn: parts,
      placeholders,
      filledValues: Array(parts.length - 1).fill(''),
      zh: zhText || ''
    };
  }

  return {
    en: cleanEn,
    zh: zhText || '',
    isAnswer: Boolean(isAnswer)
  };
}

function parseLinesToCoherentScript(rawLines, fallbackTitle) {
  let docTitle = fallbackTitle;
  let meetUrl = '';
  const sections = [];
  let currentSec = null;

  const contentLines = [];
  rawLines.forEach((line, idx) => {
    if (idx === 0 && !/^(Part|Step)\s*\d+/i.test(line)) {
      docTitle = line;
      return;
    }
    const urlMatch = line.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      meetUrl = urlMatch[0];
      const rest = line.replace(urlMatch[0], '').replace(/Google Meet\s*連結[:：]?/i, '').trim();
      if (!rest) return;
      line = rest;
    }
    contentLines.push(line);
  });

  const stitchedLines = [];
  for (let i = 0; i < contentLines.length; i++) {
    let curr = contentLines[i];
    const isPartHeader = /^(Part\s*\d+|Section\s*\d+|Step\s*\d+)\s*[|｜:：.．]/i.test(curr);

    if (!isPartHeader && stitchedLines.length > 0) {
      const prev = stitchedLines[stitchedLines.length - 1];
      const prevIsHeader = /^(Part\s*\d+|Section\s*\d+|Step\s*\d+)\s*[|｜:：.．]/i.test(prev);

      const prevEnOnly = prev.replace(/[\u4e00-\u9fa5].*$/, '').trim();
      const currEnOnly = curr.replace(/[\u4e00-\u9fa5].*$/, '').trim();

      const prevUnfinished = prevEnOnly.length > 0 && !/[.?!]$/.test(prevEnOnly);
      const currIsContinuation = currEnOnly.length > 0 &&
        (/^[a-z0-9]/.test(currEnOnly) || /^(and|or|to|from|with|in|on|at)\b/i.test(currEnOnly)) &&
        !/^(Ex:|I\s)/i.test(currEnOnly);

      if (!prevIsHeader && prevUnfinished && currIsContinuation) {
        const prevZhMatch = prev.match(/([\u4e00-\u9fa5].*)$/);
        const prevZh = prevZhMatch ? prevZhMatch[1] : '';
        stitchedLines[stitchedLines.length - 1] = `${prevEnOnly} ${curr} ${prevZh}`.trim();
        continue;
      }
    }
    stitchedLines.push(curr);
  }

  stitchedLines.forEach(line => {
    const partMatch = line.match(/^(Part\s*\d+|Section\s*\d+|Step\s*\d+)\s*[|｜:：.．\-]?\s*(.+)$/i);
    if (partMatch) {
      if (currentSec) sections.push(currentSec);
      const rawTitlePart = cleanSubHeadingText(partMatch[2]);
      const zhMatch = rawTitlePart.match(/([\u4e00-\u9fa5].*)$/);
      const titleZh = zhMatch ? zhMatch[1].trim() : '';
      const titleEn = cleanSubHeadingText(zhMatch ? rawTitlePart.replace(zhMatch[1], '') : rawTitlePart);

      currentSec = {
        part: partMatch[1].trim(),
        titleEn: titleEn || partMatch[1].trim(),
        titleZh,
        items: []
      };
      return;
    }

    if (!currentSec) {
      currentSec = {
        part: 'Part 1',
        titleEn: 'Speaking Practice',
        titleZh: '',
        items: []
      };
    }

    if (/^[\u4e00-\u9fa5，。！？、（）0-9x×\s]+$/.test(line) && /[\u4e00-\u9fa5]/.test(line)) {
      if (currentSec.items.length > 0) {
        const last = currentSec.items[currentSec.items.length - 1];
        last.zh = last.zh ? `${last.zh} ${line}` : line;
      }
      return;
    }

    const zhSplit = line.match(/^(.*?)([\u4e00-\u9fa5].*)$/);
    const enPart = zhSplit ? zhSplit[1].trim() : line.trim();
    const zhPart = zhSplit ? zhSplit[2].trim() : '';

    const splitSentences = enPart
      .replace(/([.?!])([A-Z])/g, '$1 $2')
      .match(/[^.?!]+[.?!]+|[^.?!]+$/g) || [enPart];

    splitSentences.forEach((rawSentence, sIdx) => {
      const s = rawSentence.trim();
      if (!s) return;

      const prevItem = currentSec.items[currentSec.items.length - 1];
      const isShortAnswer = prevItem && prevItem.en && prevItem.en.endsWith('?') && s.endsWith('!') && s.split(/\s+/).length <= 4;

      currentSec.items.push(
        buildSentenceItem(s, sIdx === splitSentences.length - 1 ? zhPart : '', isShortAnswer)
      );
    });
  });

  if (currentSec) sections.push(currentSec);
  return { title: docTitle, meetUrl, sections };
}

// =========================================================================
// 9. 反白選取單字（含空白輸入框選字）➔ 浮動查詢按鈕 ➔ 可愛英漢字典小視窗
// =========================================================================
const dictCache = new Map();
let pendingSelectedWord = '';

const selectionTooltipEl = document.getElementById('selectionDictTooltip');
const selectionLabelEl = document.getElementById('selectionDictLabel');
const dictModalEl = document.getElementById('dictModal');
const dictSearchFormEl = document.getElementById('dictSearchForm');
const dictSearchInputEl = document.getElementById('dictSearchInput');
const dictResultBodyEl = document.getElementById('dictResultBody');
const closeDictModalBtnEl = document.getElementById('closeDictModalBtn');

function extractEnglishWord(rawText) {
  if (!rawText) return '';
  const cleaned = rawText
    .trim()
    .replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '');
  if (!cleaned || cleaned.length > 35) return '';
  if (!/^[a-zA-Z]+(?:[-'][a-zA-Z]+)?$/.test(cleaned)) return '';
  return cleaned.toLowerCase();
}

function hideSelectionTooltip() {
  if (selectionTooltipEl) {
    selectionTooltipEl.classList.add('hidden');
    selectionTooltipEl.classList.remove('flex');
  }
}

function positionAndShowSelectionTooltip(word, rect) {
  if (!selectionTooltipEl || !selectionLabelEl) return;
  pendingSelectedWord = word;
  selectionLabelEl.textContent = `查「${word}」英漢字典`;

  selectionTooltipEl.classList.remove('hidden');
  selectionTooltipEl.classList.add('flex');

  const tooltipWidth = selectionTooltipEl.offsetWidth || 160;
  const tooltipHeight = selectionTooltipEl.offsetHeight || 36;

  let left = rect.left + rect.width / 2 - tooltipWidth / 2;
  left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, left));

  let top = rect.top - tooltipHeight - 10;
  if (top < 64) {
    top = rect.bottom + 10;
  }

  selectionTooltipEl.style.left = `${left}px`;
  selectionTooltipEl.style.top = `${top}px`;
}

function checkTextSelectionForDictionary(event) {
  if (event?.target && selectionTooltipEl?.contains(event.target)) return;
  if (dictModalEl && !dictModalEl.classList.contains('hidden')) return;

  const activeEl = document.activeElement;
  if (activeEl && activeEl.classList && activeEl.classList.contains('blank-word-input')) {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && end > start) {
      const selectedInInput = activeEl.value.substring(start, end);
      const inputWord = extractEnglishWord(selectedInInput);
      if (inputWord) {
        positionAndShowSelectionTooltip(inputWord, activeEl.getBoundingClientRect());
        return;
      }
    }
  }

  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideSelectionTooltip();
    return;
  }

  const anchorNode = sel.anchorNode;
  const containerEl = document.getElementById('scriptContainer');
  const bannerEl = document.getElementById('bannerCard');
  const isInsideContent =
    (containerEl && containerEl.contains(anchorNode)) ||
    (bannerEl && bannerEl.contains(anchorNode));

  if (!isInsideContent) {
    hideSelectionTooltip();
    return;
  }

  const word = extractEnglishWord(sel.toString());
  if (!word) {
    hideSelectionTooltip();
    return;
  }

  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    hideSelectionTooltip();
    return;
  }

  positionAndShowSelectionTooltip(word, rect);
}

document.addEventListener('mouseup', (e) => setTimeout(() => checkTextSelectionForDictionary(e), 10));
document.addEventListener('touchend', (e) => setTimeout(() => checkTextSelectionForDictionary(e), 30));
document.addEventListener('keyup', (e) => {
  if (e.shiftKey) setTimeout(() => checkTextSelectionForDictionary(e), 10);
});
document.addEventListener('mousedown', (e) => {
  if (selectionTooltipEl && !selectionTooltipEl.contains(e.target)) {
    hideSelectionTooltip();
  }
});
window.addEventListener('scroll', hideSelectionTooltip, { passive: true });

if (selectionTooltipEl) {
  selectionTooltipEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const targetWord = pendingSelectedWord;
    hideSelectionTooltip();
    if (targetWord) {
      openDictionaryModal(targetWord);
    }
  });
}

async function fetchEnglishChineseEntry(word) {
  const cleanWord = word.toLowerCase().trim();
  if (dictCache.has(cleanWord)) return dictCache.get(cleanWord);

  const candidates = [cleanWord];
  if (cleanWord.endsWith('ies') && cleanWord.length > 4) {
    candidates.push(cleanWord.slice(0, -3) + 'y');
  }
  if (cleanWord.endsWith('es') && cleanWord.length > 3) {
    candidates.push(cleanWord.slice(0, -2));
  }
  if (cleanWord.endsWith('s') && cleanWord.length > 3) {
    candidates.push(cleanWord.slice(0, -1));
  }
  if (cleanWord.endsWith('ed') && cleanWord.length > 4) {
    candidates.push(cleanWord.slice(0, -2));
    candidates.push(cleanWord.slice(0, -1));
  }
  if (cleanWord.endsWith('ing') && cleanWord.length > 5) {
    candidates.push(cleanWord.slice(0, -3));
    candidates.push(cleanWord.slice(0, -3) + 'e');
  }

  let entry = null;
  for (const candidate of [...new Set(candidates)]) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(candidate)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          entry = data[0];
          break;
        }
      }
    } catch (e) {
      console.warn('字典 API 連線異常:', e);
    }
  }

  const headwordZh = await translateEnToZhTW(entry?.word || cleanWord);

  if (!entry) {
    const fallbackResult = headwordZh
      ? { word: cleanWord, zhWord: headwordZh, phonetic: '', meanings: [] }
      : null;
    if (fallbackResult) dictCache.set(cleanWord, fallbackResult);
    return fallbackResult;
  }

  const phoneticObj = (entry.phonetics || []).find(p => p.text) || {};
  const phonetic = entry.phonetic || phoneticObj.text || '';

  const meanings = [];
  for (const m of (entry.meanings || [])) {
    const defs = (m.definitions || []).slice(0, 3);
    const enrichedDefs = await Promise.all(
      defs.map(async (d) => {
        const [defZh, exampleZh] = await Promise.all([
          translateEnToZhTW(d.definition),
          d.example ? translateEnToZhTW(d.example) : Promise.resolve('')
        ]);
        return {
          definitionEn: d.definition,
          definitionZh: defZh,
          exampleEn: d.example || '',
          exampleZh
        };
      })
    );
    meanings.push({
      partOfSpeech: m.partOfSpeech || 'word',
      definitions: enrichedDefs
    });
  }

  const result = {
    word: entry.word || cleanWord,
    zhWord: headwordZh,
    phonetic,
    meanings
  };

  dictCache.set(cleanWord, result);
  return result;
}

const posZhMap = {
  noun: 'n. 名詞',
  verb: 'v. 動詞',
  adjective: 'adj. 形容詞',
  adverb: 'adv. 副詞',
  pronoun: 'pron. 代名詞',
  preposition: 'prep. 介系詞',
  conjunction: 'conj. 連接詞',
  interjection: 'int. 感嘆詞'
};

window.openDictionaryModal = async function(word) {
  const cleanWord = extractEnglishWord(word) || word.trim().toLowerCase();
  if (!cleanWord) return;

  dictSearchInputEl.value = cleanWord;
  dictModalEl.classList.remove('hidden');

  dictResultBodyEl.innerHTML = `
    <div class="py-10 text-center space-y-2">
      <div class="text-3xl animate-bounce">🔎</div>
      <p class="text-sm font-bold text-slate-600">正在查詢英漢字典「<span class="text-sky-600">${escapeHtml(cleanWord)}</span>」...</p>
    </div>
  `;

  const entry = await fetchEnglishChineseEntry(cleanWord);
  if (!entry) {
    dictResultBodyEl.innerHTML = `
      <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-2.5">
        <div class="text-3xl">🐣</div>
        <p class="font-bold text-rose-700">找不到「${escapeHtml(cleanWord)}」的英漢字典條目</p>
        <p class="text-xs text-slate-600">可能是專有名詞或縮寫，您可以試試輸入單字原形，或前往外部字典查看：</p>
        <div class="flex items-center justify-center gap-2 pt-1">
          <a href="https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(cleanWord)}" target="_blank" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl transition">
            劍橋英漢字典 ↗
          </a>
        </div>
      </div>
    `;
    return;
  }

  const headword = entry.word || cleanWord;
  const safeHeadword = headword.replace(/'/g, "\\'");

  const posColors = {
    noun: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    verb: 'bg-sky-100 text-sky-800 border-sky-200',
    adjective: 'bg-amber-100 text-amber-800 border-amber-200',
    adverb: 'bg-purple-100 text-purple-800 border-purple-200'
  };

  const meaningsHtml = (entry.meanings || []).map((m) => {
    const pos = (m.partOfSpeech || '').toLowerCase();
    const badgeStyle = posColors[pos] || 'bg-slate-100 text-slate-700 border-slate-200';
    const posLabel = posZhMap[pos] || m.partOfSpeech;

    const defsListHtml = m.definitions.map((d, idx) => {
      const safeExample = (d.exampleEn || '').replace(/'/g, "\\'");
      return `
        <li class="pl-1 space-y-1">
          <p class="text-slate-900 font-bold leading-relaxed">
            <span class="text-amber-600 font-bold mr-1">${idx + 1}.</span>${escapeHtml(d.definitionZh || d.definitionEn)}
          </p>
          ${d.definitionZh ? `<p class="text-xs text-slate-500 leading-relaxed">${escapeHtml(d.definitionEn)}</p>` : ''}
          ${d.exampleEn ? `
            <div class="mt-1.5 pl-3 border-l-2 border-sky-300 bg-sky-50/70 rounded-r-xl py-1.5 px-2.5 flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <p class="text-xs italic text-slate-700 leading-relaxed">"${escapeHtml(d.exampleEn)}"</p>
                ${d.exampleZh ? `<p class="text-[11px] text-slate-500">${escapeHtml(d.exampleZh)}</p>` : ''}
              </div>
              <button
                type="button"
                onclick="speakText('${safeExample}', null)"
                class="shrink-0 text-xs px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold transition"
                title="朗讀例句"
              >
                🔊
              </button>
            </div>
          ` : ''}
        </li>
      `;
    }).join('');

    return `
      <div class="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-2.5">
        <span class="inline-block text-xs font-bold px-2.5 py-0.5 rounded-full border ${badgeStyle}">
          ${escapeHtml(posLabel)}
        </span>
        <ol class="space-y-3">
          ${defsListHtml}
        </ol>
      </div>
    `;
  }).join('');

  dictResultBodyEl.innerHTML = `
    <div class="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200">
      <div>
        <div class="flex items-baseline gap-2 flex-wrap">
          <span class="en-font text-2xl font-bold text-sky-950">${escapeHtml(headword)}</span>
          ${entry.zhWord ? `<span class="text-base font-bold text-emerald-700">${escapeHtml(entry.zhWord)}</span>` : ''}
        </div>
        ${entry.phonetic ? `<div class="font-mono text-xs text-sky-700 mt-0.5">${escapeHtml(entry.phonetic)}</div>` : ''}
      </div>
      <button
        type="button"
        onclick="speakText('${safeHeadword}', null)"
        class="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-xs transition shrink-0"
      >
        🔊 發音
      </button>
    </div>

    ${meaningsHtml || `
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        中文翻譯：<strong>${escapeHtml(entry.zhWord || cleanWord)}</strong>
      </div>
    `}
  `;
};

window.closeDictionaryModal = function() {
  if (dictModalEl) {
    dictModalEl.classList.add('hidden');
  }
};

if (closeDictModalBtnEl) {
  closeDictModalBtnEl.addEventListener('click', window.closeDictionaryModal);
}
if (dictModalEl) {
  dictModalEl.addEventListener('click', (e) => {
    if (e.target === dictModalEl) window.closeDictionaryModal();
  });
}
if (dictSearchFormEl) {
  dictSearchFormEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = dictSearchInputEl.value.trim();
    if (q) window.openDictionaryModal(q);
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dictModalEl && !dictModalEl.classList.contains('hidden')) {
    window.closeDictionaryModal();
  }
});

// 初始套用權限狀態、渲染並載入 Firestore 講稿清單
applyAdminUiPermissions();
renderScript(currentScript);
fetchCloudScripts();
