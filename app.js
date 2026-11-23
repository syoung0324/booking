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
// 1. Firebase Firestore 初始化設定
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
  return fullSentence.replace(/\s+/g, ' ').trim();
}

function hasAnyFilledBlank(item) {
  return Array.isArray(item?.filledValues) && item.filledValues.some(v => (v || '').trim().length > 0);
}

async function autoTranslateMissingChinese(scriptObj, silentIfNone = true, forceRetranslateFilled = false) {
  if (!scriptObj || !Array.isArray(scriptObj.sections)) return 0;

  const tasks = [];

  scriptObj.sections.forEach(sec => {
    if ((!sec.titleZh || !sec.titleZh.trim() || sec.titleZh === '口說練習段落') && sec.titleEn && !/^Part\s*\d+$/i.test(sec.titleEn)) {
      tasks.push(async () => {
        const zhTitle = await translateEnToZhTW(sec.titleEn);
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
            const templateStr = item.templateEn.join(' [___] ').replace(/\s+/g, ' ').trim();
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

  showToast(`🌐 正在翻譯 ${tasks.length} 句繁體中文...`);

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

  showToast(`✅ 已自動完成 ${tasks.length} 句繁體中文翻譯！請點擊「☁️ 儲存至雲端」保存。`);
  return tasks.length;
}

window.triggerManualTranslate = async function() {
  await autoTranslateMissingChinese(currentScript, false, true);
};

// =========================================================================
// 3. 預設範本與主題插圖生成器
// =========================================================================
function getIllustrationSvg(keywordText, fallbackIdx = 0) {
  const text = (keywordText || '').toLowerCase();
  if (text.includes('mystery') || text.includes('guess') || text.includes('pencil') || text.includes('object')) {
    return `
      <svg viewBox="0 0 120 120" class="w-24 h-24 mx-auto">
        <rect x="10" y="10" width="100" height="100" rx="20" fill="#d1fae5"/>
        <g transform="rotate(-35 60 60)">
          <rect x="52" y="25" width="16" height="58" rx="2" fill="#facc15" stroke="#ca8a04" stroke-width="2"/>
          <rect x="52" y="20" width="16" height="8" rx="2" fill="#f472b6" stroke="#db2777" stroke-width="2"/>
          <polygon points="52,83 68,83 60,98" fill="#fde68a" stroke="#ca8a04" stroke-width="2"/>
          <polygon points="58,93 62,93 60,98" fill="#1e293b"/>
        </g>
        <text x="82" y="42" font-size="22" font-weight="bold" fill="#059669">?</text>
      </svg>`;
  }
  if (text.includes('dinner') || text.includes('food') || text.includes('eat') || text.includes('lunch') || text.includes('breakfast')) {
    return `
      <svg viewBox="0 0 120 120" class="w-24 h-24 mx-auto">
        <rect x="10" y="10" width="100" height="100" rx="20" fill="#fef3c7"/>
        <circle cx="60" cy="62" r="32" fill="#ffffff" stroke="#f59e0b" stroke-width="3"/>
        <circle cx="60" cy="62" r="24" fill="none" stroke="#fde68a" stroke-width="2" stroke-dasharray="4 3"/>
        <circle cx="52" cy="56" r="8" fill="#ef4444"/>
        <path d="M62 66 Q72 52 76 68 Z" fill="#22c55e"/>
        <rect x="48" y="68" width="16" height="6" rx="3" fill="#f97316"/>
      </svg>`;
  }
  if (text.includes('bingo') || text.includes('grid') || text.includes('5x5')) {
    return `
      <svg viewBox="0 0 120 120" class="w-24 h-24 mx-auto">
        <rect x="10" y="10" width="100" height="100" rx="20" fill="#f3e8ff"/>
        <g transform="translate(25, 25)">
          <rect x="0" y="0" width="70" height="70" rx="6" fill="#ffffff" stroke="#9333ea" stroke-width="2"/>
          <line x1="23" y1="0" x2="23" y2="70" stroke="#d8b4fe" stroke-width="2"/>
          <line x1="47" y1="0" x2="47" y2="70" stroke="#d8b4fe" stroke-width="2"/>
          <line x1="0" y1="23" x2="70" y2="23" stroke="#d8b4fe" stroke-width="2"/>
          <line x1="0" y1="47" x2="70" y2="47" stroke="#d8b4fe" stroke-width="2"/>
          <line x1="5" y1="5" x2="65" y2="65" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>
          <circle cx="12" cy="12" r="5" fill="#facc15"/>
          <circle cx="35" cy="35" r="5" fill="#facc15"/>
          <circle cx="58" cy="58" r="5" fill="#facc15"/>
        </g>
      </svg>`;
  }
  if (text.includes('number') || text.includes('bigger') || text.includes('count') || text.includes('math')) {
    return `
      <svg viewBox="0 0 120 120" class="w-24 h-24 mx-auto">
        <rect x="10" y="10" width="100" height="100" rx="20" fill="#e0f2fe"/>
        <rect x="22" y="45" width="32" height="36" rx="8" fill="#bae6fd" stroke="#0284c7" stroke-width="2"/>
        <text x="38" y="69" text-anchor="middle" font-size="16" font-weight="bold" fill="#0369a1">28</text>
        <rect x="64" y="32" width="36" height="49" rx="8" fill="#0284c7"/>
        <text x="82" y="63" text-anchor="middle" font-size="20" font-weight="bold" fill="#ffffff">45</text>
        <text x="58" y="35" text-anchor="middle" font-size="14" font-weight="bold" fill="#0284c7">&lt;</text>
      </svg>`;
  }
  const fallbackIcons = ['🗣️', '📘', '🌟', '🎯'];
  const bgColors = ['bg-emerald-100', 'bg-amber-100', 'bg-sky-100', 'bg-purple-100'];
  return `<div class="w-24 h-24 rounded-2xl ${bgColors[fallbackIdx % 4]} flex items-center justify-center text-4xl mx-auto">${fallbackIcons[fallbackIdx % 4]}</div>`;
}

const defaultScriptData = {
  id: "default",
  title: "Speaking Club 11/13 8pm",
  meetUrl: "https://meet.google.com/ppf-tncw-krk",
  sections: [
    {
      part: "Part 1",
      titleEn: "Mystery Object: Show & Guess",
      titleZh: "給提示猜物品",
      icon: "🔍",
      color: "emerald",
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
      icon: "🍽️",
      color: "amber",
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
      icon: "🔢",
      color: "sky",
      items: [
        { en: "Listen to the sentences and write down the bigger number.", zh: "聽句子，寫出比較大的數字。" }
      ]
    },
    {
      part: "Part 4",
      titleEn: "Number Bingo: 26–51",
      titleZh: "數字賓果",
      icon: "🎯",
      color: "purple",
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
// 4. Firestore 讀寫與刪除邏輯（含填空單字同步與密碼錯誤明確警示）
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

    querySnapshot.forEach((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() };
      savedScriptsMap.set(docSnap.id, data);

      const opt = document.createElement('option');
      opt.value = docSnap.id;
      opt.textContent = `☁️ ${data.title || '未命名講稿'}`;
      selectEl.appendChild(opt);
    });

    statusBadge.textContent = `🟢 雲端已連線 (${savedScriptsMap.size} 份)`;
    statusBadge.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800";

    if (selectIdAfterLoad && savedScriptsMap.has(selectIdAfterLoad)) {
      selectEl.value = selectIdAfterLoad;
      await loadSelectedScript(selectIdAfterLoad);
    } else if (!selectIdAfterLoad && savedScriptsMap.size > 0) {
      const latestId = querySnapshot.docs[0].id;
      selectEl.value = latestId;
      await loadSelectedScript(latestId);
    }
  } catch (err) {
    console.error("Firestore 讀取失敗:", err);
    statusBadge.textContent = "🔴 雲端連線異常";
    statusBadge.className = "text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800";
    showToast(`⚠️ 無法讀取 Firestore：${err.message}`, true);
  }
}

window.loadSelectedScript = async function(scriptId) {
  editingTarget = { secIdx: null, itemIdx: null };
  isEditingHeader = false;
  const deleteBtn = document.getElementById('deleteCloudBtn');
  if (scriptId === 'default') {
    currentScript = structuredClone(defaultScriptData);
    deleteBtn.classList.add('hidden');
    renderScript(currentScript);
    return;
  }

  const target = savedScriptsMap.get(scriptId);
  if (target) {
    currentScript = structuredClone(target);
    deleteBtn.classList.remove('hidden');
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
  if (isEditingHeader) {
    window.saveHeaderEdit();
  }
  if (editingTarget.secIdx !== null && editingTarget.itemIdx !== null) {
    await window.saveInlineEdit(editingTarget.secIdx, editingTarget.itemIdx);
  }

  const enteredPassword = await promptAdminPassword(`儲存講稿「${currentScript.title}」至雲端`);
  if (!enteredPassword) return;

  const saveBtn = document.getElementById('saveCloudBtn');
  const originalHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span>⏳</span> 驗證並儲存中...';

  let shouldRetry = false;

  try {
    const cleanSections = sanitizeForFirestore(
      currentScript.sections.map((sec, sIdx) => ({
        part: sec.part || 'Part 1',
        titleEn: sec.titleEn || '',
        titleZh: sec.titleZh || '口說練習段落',
        icon: sec.icon || '🗣️',
        color: sec.color || 'sky',
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

    const payload = {
      adminKey: enteredPassword,
      title: currentScript.title || "English Speaking Script",
      meetUrl: currentScript.meetUrl || "",
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

    showToast(`✅ 密碼驗證通過，已成功儲存至雲端「${payload.title}」（含 ${zhCount} 句中文翻譯與填空單字）`);
    await fetchCloudScripts(savedId);
  } catch (err) {
    console.error("Firestore 儲存失敗:", err);
    const isAuthError = err.code === 'permission-denied' ||
      (err.message && (err.message.includes('Missing or insufficient permissions') || err.message.includes('PERMISSION_DENIED')));

    if (isAuthError) {
      showToast("❌ 管理員密碼錯誤！資料「沒有儲存成功」，請確認密碼後再試。", true);
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
    await window.saveScriptToFirestore();
  }
};

window.deleteCurrentCloudScript = async function() {
  if (!currentScript.id || currentScript.id === 'default') return;

  const enteredPassword = await promptAdminPassword(`從雲端刪除「${currentScript.title}」`);
  if (!enteredPassword) return;

  let shouldRetry = false;
  const docRef = doc(db, COLLECTION_NAME, currentScript.id);

  try {
    await setDoc(docRef, { adminKey: enteredPassword }, { merge: true });
    await deleteDoc(docRef);

    showToast(`🗑️ 密碼驗證通過，已從雲端刪除：「${currentScript.title}」`);
    currentScript = structuredClone(defaultScriptData);
    document.getElementById('savedScriptsSelect').value = 'default';
    document.getElementById('deleteCloudBtn').classList.add('hidden');
    renderScript(currentScript);
    await fetchCloudScripts('default');
  } catch (err) {
    console.error("刪除失敗:", err);
    const isAuthError = err.code === 'permission-denied' ||
      (err.message && (err.message.includes('Missing or insufficient permissions') || err.message.includes('PERMISSION_DENIED')));

    if (isAuthError) {
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
    await window.deleteCurrentCloudScript();
  }
};

// =========================================================================
// 4-1. 活動資訊橫幅（原地行內編輯）
// =========================================================================
window.editDocHeader = function() {
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
    ? 'inline-block bg-emerald-400/25 text-emerald-100 text-xs font-semibold px-2.5 py-1 rounded-full'
    : 'inline-block bg-amber-300/25 text-amber-100 text-xs font-semibold px-2.5 py-1 rounded-full';
  const badgeText = isCloud ? '☁️ 雲端同步講稿' : '本地未儲存 / 範本';

  if (isEditingHeader) {
    bannerCard.innerHTML = `
      <div class="flex-1 w-full space-y-3">
        <div class="flex items-center gap-2">
          <span class="inline-block bg-white/20 text-xs font-semibold px-3 py-1 rounded-full">
            線上口說練習講稿
          </span>
          <span class="${badgeClass}">${badgeText}</span>
          <span class="text-xs text-amber-200 font-bold">✏️ 編輯模式</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label for="editHeaderTitleInput" class="block text-xs font-bold text-sky-100 mb-1">
              講稿標題：
            </label>
            <input
              id="editHeaderTitleInput"
              type="text"
              value="${escapeAttr(data.title || '')}"
              onkeydown="handleHeaderEditKeydown(event)"
              placeholder="輸入講稿標題..."
              class="en-font w-full px-3.5 py-2 text-base md:text-lg font-bold text-slate-900 bg-white border-2 border-amber-300 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <div>
            <label for="editHeaderMeetInput" class="block text-xs font-bold text-sky-100 mb-1">
              Google Meet 教室連結（留空則隱藏）：
            </label>
            <input
              id="editHeaderMeetInput"
              type="text"
              value="${escapeAttr(data.meetUrl || '')}"
              onkeydown="handleHeaderEditKeydown(event)"
              placeholder="https://meet.google.com/..."
              class="font-mono w-full px-3.5 py-2 text-sm font-medium text-slate-900 bg-white border-2 border-sky-200 rounded-xl shadow-xs focus:outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-200"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onclick="saveHeaderEdit()"
            class="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm transition"
          >
            ✅ 完成修改
          </button>
          <button
            type="button"
            onclick="cancelHeaderEdit()"
            class="px-3.5 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-lg transition"
          >
            ✕ 取消
          </button>
          <span class="text-xs text-sky-100/90 ml-1">按 Enter 套用 • Esc 取消</span>
        </div>
      </div>
    `;
    return;
  }

  const safeTitle = escapeHtml(data.title || 'English Speaking Script');
  const meetUrl = (data.meetUrl || '').trim();
  const normalizedHref = meetUrl && !/^https?:\/\//i.test(meetUrl) ? `https://${meetUrl}` : meetUrl;
  const displayMeetText = escapeHtml(meetUrl.replace(/^https?:\/\//i, ''));

  bannerCard.innerHTML = `
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
        <span class="inline-block bg-white/20 text-xs font-semibold px-3 py-1 rounded-full">
          線上口說練習講稿
        </span>
        <span id="docSourceBadge" class="${badgeClass}">
          ${badgeText}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <h2 id="docTitle" class="en-font text-2xl md:text-3xl font-bold tracking-wide">
          ${safeTitle}
        </h2>
        <button onclick="editDocHeader()" class="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-lg text-white font-medium transition" title="直接在此處編輯標題與 Meet 連結">
          ✏️ 編輯資訊
        </button>
      </div>
      <p id="docSubtitle" class="text-sky-100 text-sm mt-1">
        選取英文單字可查詢英漢字典；空白欄輸入單字後會自動翻譯並可儲存至雲端
      </p>
    </div>
    ${meetUrl ? `
      <div id="meetLinkBox" class="bg-white/15 backdrop-blur-sm border border-white/25 rounded-xl p-3.5 text-sm shrink-0">
        <div class="text-xs text-sky-100 mb-1">Google Meet 教室連結：</div>
        <a href="${escapeAttr(normalizedHref)}" target="_blank" class="font-mono font-bold underline hover:text-amber-200 break-all">
          ${displayMeetText}
        </a>
      </div>
    ` : ''}
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

  const cleanSpeech = text.replace(/^Ex:\s*/i, 'Example: ');
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
    allSentences.push({ text: `${sec.part}. ${sec.titleEn}`, id: null });
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
// 6. 空白欄位輸入、自動翻譯、查字典與原地行內編輯
// =========================================================================
window.handleBlankInput = function(secIdx, itemIdx, pIdx, value) {
  const item = currentScript.sections[secIdx]?.items[itemIdx];
  if (!item) return;
  if (!Array.isArray(item.filledValues)) {
    item.filledValues = Array(item.placeholders.length).fill('');
  }
  item.filledValues[pIdx] = value;

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
    const templateStr = item.templateEn.join(' [___] ').replace(/\s+/g, ' ').trim();
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
  if (itemIdx <= 0) return;
  editingTarget = { secIdx: null, itemIdx: null };
  const items = currentScript.sections[secIdx].items;
  const prev = items[itemIdx - 1];
  const curr = items[itemIdx];

  const prevText = prev.templateEn ? prev.templateEn.join('___') : prev.en;
  const currText = curr.templateEn ? curr.templateEn.join('___') : curr.en;

  const mergedEn = `${prevText} ${currText}`.replace(/\s+/g, ' ').trim();
  const mergedZh = [prev.zh, curr.zh].filter(Boolean).join(' ');

  items[itemIdx - 1] = buildSentenceItem(mergedEn, mergedZh, false);
  items.splice(itemIdx, 1);
  renderScript(currentScript);
  if (!mergedZh) {
    await autoTranslateMissingChinese(currentScript, true);
  }
};

window.editSentence = function(secIdx, itemIdx) {
  editingTarget = { secIdx, itemIdx };
  renderScript(currentScript);

  setTimeout(() => {
    const enInput = document.getElementById(`edit-en-${secIdx}-${itemIdx}`);
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
  const enInput = document.getElementById(`edit-en-${secIdx}-${itemIdx}`);
  const zhInput = document.getElementById(`edit-zh-${secIdx}-${itemIdx}`);
  if (!enInput || !zhInput) return;

  const item = currentScript.sections[secIdx].items[itemIdx];
  const newEn = enInput.value.trim();
  const newZh = zhInput.value.trim();

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

window.handleInlineEditKeydown = function(event, secIdx, itemIdx) {
  if (event.key === 'Enter') {
    event.preventDefault();
    window.saveInlineEdit(secIdx, itemIdx);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    window.cancelInlineEdit();
  }
};

function renderScript(data) {
  currentScript = data;
  renderHeaderBanner(data);

  const container = document.getElementById('scriptContainer');
  container.innerHTML = '';

  const colorMap = {
    emerald: { badge: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200', title: 'text-emerald-900' },
    amber:   { badge: 'bg-amber-100 text-amber-800',     border: 'border-amber-200',   title: 'text-amber-900' },
    sky:     { badge: 'bg-sky-100 text-sky-800',         border: 'border-sky-200',     title: 'text-sky-900' },
    purple:  { badge: 'bg-purple-100 text-purple-800',   border: 'border-purple-200',  title: 'text-purple-900' }
  };

  data.sections.forEach((sec, sIdx) => {
    const theme = colorMap[sec.color] || colorMap.sky;
    const svgContent = sec.illustrationSvg || getIllustrationSvg(`${sec.titleEn} ${sec.titleZh}`, sIdx);
    const card = document.createElement('section');
    card.className = `bg-white rounded-2xl shadow-sm border ${theme.border} overflow-hidden`;

    let itemsHtml = sec.items.map((item, iIdx) => {
      const rowId = `row-${sIdx}-${iIdx}`;
      const isEditingThisRow = editingTarget.secIdx === sIdx && editingTarget.itemIdx === iIdx;

      if (isEditingThisRow) {
        const rawEn = item.templateEn ? item.templateEn.join('___') : (item.en || '');
        const rawZh = item.zh || '';
        const safePreviewText = rawEn.replace(/___/g, 'something').replace(/'/g, "\\'");

        return `
          <div id="${rowId}" class="p-3.5 rounded-xl bg-sky-50/90 border-2 border-sky-400 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition">
            <div class="flex-1 space-y-2">
              <div>
                <label class="block text-[11px] font-bold text-sky-800 mb-0.5">英文句子（輸入 <code class="bg-sky-100 px-1 rounded">___</code> 可自動轉為填空欄位）</label>
                <input
                  id="edit-en-${sIdx}-${iIdx}"
                  type="text"
                  value="${escapeAttr(rawEn)}"
                  onkeydown="handleInlineEditKeydown(event, ${sIdx}, ${iIdx})"
                  placeholder="輸入英文句子..."
                  class="en-font w-full px-3 py-1.5 text-base font-medium text-slate-900 bg-white border border-sky-300 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-slate-600 mb-0.5">中文提示（留空按完成會自動翻譯成繁體中文）</label>
                <input
                  id="edit-zh-${sIdx}-${iIdx}"
                  type="text"
                  value="${escapeAttr(rawZh)}"
                  onkeydown="handleInlineEditKeydown(event, ${sIdx}, ${iIdx})"
                  placeholder="輸入中文提示或留空自動翻譯..."
                  class="w-full px-3 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                />
              </div>
              <div class="flex items-center gap-2 pt-0.5">
                <button onclick="saveInlineEdit(${sIdx}, ${iIdx})" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition">
                  ✅ 完成
                </button>
                <button onclick="cancelInlineEdit()" class="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition">
                  ✕ 取消
                </button>
                <span class="text-[11px] text-slate-400">按 Enter 儲存 • Esc 取消</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0 self-start sm:self-center">
              <button onclick="speakText('${safePreviewText}', '${rowId}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 transition">
                🔊 試聽
              </button>
            </div>
          </div>
        `;
      }

      const toolBtns = `
        <div class="flex items-center gap-1 opacity-75 hover:opacity-100 transition">
          ${iIdx > 0 ? `<button onclick="mergeWithPrevious(${sIdx}, ${iIdx})" class="text-[11px] px-1.5 py-0.5 rounded bg-slate-200/80 hover:bg-slate-300 text-slate-600" title="與上一句合併">⬆️ 合併</button>` : ''}
          <button onclick="editSentence(${sIdx}, ${iIdx})" class="text-[11px] px-1.5 py-0.5 rounded bg-slate-200/80 hover:bg-sky-200 text-slate-700" title="直接在此處編輯中英文">✏️</button>
        </div>
      `;

      if (item.templateEn) {
        const filledVals = Array.isArray(item.filledValues) ? item.filledValues : [];
        let sentenceHtml = '';
        item.templateEn.forEach((part, pIdx) => {
          sentenceHtml += `<span>${escapeHtml(part)}</span>`;
          if (pIdx < item.placeholders.length) {
            const curVal = filledVals[pIdx] || '';
            const hintWord = curVal || item.placeholders[pIdx];
            sentenceHtml += `
              <span class="inline-flex items-center mx-1.5 my-0.5 bg-indigo-50 border-b-2 border-indigo-400 rounded-t px-1">
                <input
                  id="input-${sIdx}-${iIdx}-${pIdx}"
                  type="text"
                  value="${escapeAttr(curVal)}"
                  placeholder="${escapeAttr(item.placeholders[pIdx])}"
                  oninput="handleBlankInput(${sIdx}, ${iIdx}, ${pIdx}, this.value)"
                  onblur="translateFilledSentence(${sIdx}, ${iIdx})"
                  onkeydown="handleBlankKeydown(event, ${sIdx}, ${iIdx})"
                  class="blank-word-input px-1.5 py-0.5 w-28 text-center font-bold text-indigo-700 bg-transparent focus:outline-none"
                />
                <button
                  id="lookup-btn-${sIdx}-${iIdx}-${pIdx}"
                  type="button"
                  onclick="lookupBlankWord(${sIdx}, ${iIdx}, ${pIdx})"
                  class="text-xs px-1 py-0.5 text-amber-600 hover:text-amber-800 hover:scale-110 transition"
                  title="查詢「${escapeAttr(hintWord)}」英漢字典"
                >📖</button>
              </span>
            `;
          }
        });

        return `
          <div id="${rowId}" class="p-3.5 rounded-xl bg-amber-50/40 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex-1">
              <div class="en-font text-lg text-slate-800 font-medium flex flex-wrap items-center">${sentenceHtml}</div>
              <div class="flex items-center justify-between mt-1 gap-2">
                <span id="zh-text-${sIdx}-${iIdx}" class="text-xs text-slate-500">${escapeHtml(item.zh || '⏳ 準備翻譯中文...')}</span>
                ${toolBtns}
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="speakTemplate(${sIdx}, ${iIdx})" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 transition">
                🔊 朗讀
              </button>
            </div>
          </div>
        `;
      }

      if (item.isAnswer) {
        const safeText = item.en.replace(/'/g, "\\'");
        return `
          <div id="${rowId}" class="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-3">
            <div class="flex-1 flex items-center justify-between gap-2">
              <div class="flex items-center gap-3 flex-wrap">
                <button onclick="this.nextElementSibling.classList.toggle('blur-sm')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md font-bold transition">
                  👀 點擊揭曉答案
                </button>
                <div class="blur-sm transition duration-200 select-none">
                  <span class="en-font text-lg font-bold text-emerald-800">${escapeHtml(item.en)}</span>
                  ${item.zh ? `<span class="text-xs text-emerald-600 ml-2">${escapeHtml(item.zh)}</span>` : ''}
                </div>
              </div>
              ${toolBtns}
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button onclick="speakText('${safeText}', '${rowId}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm">
                🔊 播放
              </button>
            </div>
          </div>
        `;
      }

      const safeText = item.en.replace(/'/g, "\\'");
      return `
        <div id="${rowId}" class="p-3.5 rounded-xl bg-slate-50 hover:bg-sky-50/50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition">
          <div class="flex-1">
            <div class="en-font text-lg text-slate-800 font-medium">${escapeHtml(item.en)}</div>
            <div class="flex items-center justify-between mt-0.5">
              <span class="text-xs text-slate-500">${escapeHtml(item.zh || '')}</span>
              ${toolBtns}
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="speakText('${safeText}', '${rowId}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1 transition">
              🔊 播放
            </button>
          </div>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="p-5 md:p-6 flex flex-col md:flex-row gap-5">
        <div class="md:w-44 shrink-0 flex flex-col items-center justify-center text-center bg-slate-50/80 rounded-xl p-4 border border-slate-100">
          <span class="text-xs font-bold px-2.5 py-0.5 rounded-full ${theme.badge} mb-2">
            ${escapeHtml(sec.part)}
          </span>
          ${svgContent}
          <div class="text-xs font-bold text-slate-600 mt-2">${escapeHtml(sec.titleZh || '口說練習段落')}</div>
        </div>

        <div class="flex-1">
          <div class="flex items-center justify-between mb-3">
            <h3 class="en-font text-xl font-bold ${theme.title} flex items-center gap-2">
              <span>${sec.icon}</span> ${escapeHtml(sec.titleEn)}
            </h3>
            <button onclick="speakText('${sec.titleEn.replace(/'/g, "\\'")}', null)" class="text-xs text-slate-400 hover:text-sky-600 font-medium">
              🔊 唸標題
            </button>
          </div>
          <div class="space-y-2.5">
            ${itemsHtml}
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// =========================================================================
// 7. PDF 座標級解析、跨行斷句與自動中譯
// =========================================================================
window.handlePdfUpload = async function(event) {
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
  document.getElementById('deleteCloudBtn').classList.add('hidden');
  renderScript(parsedData);

  event.target.value = '';

  const translatedCount = await autoTranslateMissingChinese(currentScript, true);
  if (translatedCount === 0) {
    showToast(`📄 已匯入「${file.name}」！確認句型無誤後，請點擊右上角「☁️ 儲存至雲端」並輸入管理密碼保存。`);
  }
};

function buildSentenceItem(enText, zhText, isAnswer = false) {
  let cleanEn = enText.replace(/_{2,}/g, '___').replace(/\s+/g, ' ').trim();

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

  const colors = ['emerald', 'amber', 'sky', 'purple'];
  const icons = ['🔍', '🍽️', '🔢', '🎯'];

  const contentLines = [];
  rawLines.forEach((line, idx) => {
    if (idx === 0 && !/^Part\s*\d+/i.test(line)) {
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
    const isPartHeader = /^(Part\s*\d+|Section\s*\d+|Step\s*\d+)\s*[|｜:：]/i.test(curr);

    if (!isPartHeader && stitchedLines.length > 0) {
      const prev = stitchedLines[stitchedLines.length - 1];
      const prevIsHeader = /^(Part\s*\d+|Section\s*\d+|Step\s*\d+)\s*[|｜:：]/i.test(prev);

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
    const partMatch = line.match(/^(Part\s*\d+|Section\s*\d+|Step\s*\d+)\s*[|｜:：]?\s*(.+)$/i);
    if (partMatch) {
      if (currentSec) sections.push(currentSec);
      const secIdx = sections.length;
      const zhMatch = partMatch[2].match(/([\u4e00-\u9fa5].*)$/);
      const titleZh = zhMatch ? zhMatch[1].trim() : '';
      const titleEn = zhMatch ? partMatch[2].replace(zhMatch[1], '').trim() : partMatch[2].trim();

      currentSec = {
        part: partMatch[1],
        titleEn: titleEn || partMatch[1],
        titleZh,
        icon: icons[secIdx % icons.length],
        color: colors[secIdx % colors.length],
        items: []
      };
      return;
    }

    if (!currentSec) {
      currentSec = {
        part: 'Part 1',
        titleEn: 'Speaking Practice',
        titleZh: '',
        icon: '🗣️',
        color: 'sky',
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
// 8. 反白選取單字（含空白輸入框選字）➔ 浮動查詢按鈕 ➔ 可愛英漢字典小視窗
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

  // 1. 優先檢查是否在空白單字輸入框中選取文字
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

  // 2. 檢查一般講稿文字選取
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

// 初始渲染並載入 Firestore 講稿清單
renderScript(currentScript);
fetchCloudScripts();
