const WORKER_URL = 'https://boda-uploader.infoiterabyd.workers.dev';
const MAX_SIZE_MB = 350;
const MAX_FILES_PER_BATCH = 10;

const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const uploadBtn = document.getElementById('uploadBtn');

const modalOverlay = document.getElementById('modalOverlay');
const modalIcon = document.getElementById('modalIcon');
const modalTitle = document.getElementById('modalTitle');
const modalText = document.getElementById('modalText');
const modalCloseBtn = document.getElementById('modalCloseBtn');

let selectedFiles = [];

// Inicializa los iconos estáticos del HTML al cargar la página
if (window.lucide) lucide.createIcons();

function resetForm() {
  selectedFiles = [];
  fileInput.value = '';
  fileList.innerHTML = '';
  fileList.classList.add('hidden');
  uploadBtn.classList.add('hidden');
  uploadBtn.disabled = false;
}

function showModal({ icon, title, text, colorClass }) {
  modalIcon.innerHTML = `<i data-lucide="${icon}" class="w-12 h-12 ${colorClass}"></i>`;
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalOverlay.classList.remove('hidden');
  lucide.createIcons();
}

modalCloseBtn.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
});

fileInput.addEventListener('change', () => {
  let files = [...fileInput.files];
  const warnings = [];

  // Límite de cantidad de archivos por subida
  if (files.length > MAX_FILES_PER_BATCH) {
    warnings.push(`Solo se permiten ${MAX_FILES_PER_BATCH} archivos por subida. Se tomaron los primeros ${MAX_FILES_PER_BATCH}.`);
    files = files.slice(0, MAX_FILES_PER_BATCH);
  }

  // Límite de tamaño por archivo
  selectedFiles = files.filter(f => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      warnings.push(`"${f.name}" supera los ${MAX_SIZE_MB}MB y fue omitido.`);
      return false;
    }
    return true;
  });

  if (warnings.length > 0) {
    showModal({
      icon: 'alert-triangle',
      title: 'Algunos archivos fueron omitidos',
      text: warnings.join(' '),
      colorClass: 'text-amber-500'
    });
  }

  fileList.innerHTML = '';
  if (selectedFiles.length === 0) {
    fileList.classList.add('hidden');
    uploadBtn.classList.add('hidden');
    return;
  }

  selectedFiles.forEach((f, i) => {
    const isVideo = f.type.startsWith('video');
    const item = document.createElement('div');
    item.id = `file-item-${i}`;
    item.className = 'bg-cream rounded-lg px-3 py-2 border border-olive/10';

    item.innerHTML = `
      <div class="flex items-start gap-2">
        <i data-lucide="${isVideo ? 'video' : 'image'}" class="w-4 h-4 text-olive mt-0.5 flex-shrink-0"></i>
        <p class="text-sm font-display font-bold text-olive truncate">${f.name} <span class="font-body font-normal text-olive/50">(${(f.size / 1024 / 1024).toFixed(1)} MB)</span></p>
      </div>
      <p id="file-status-${i}" class="text-xs text-olive/50 mt-1 ml-6">En espera...</p>
      <div class="w-full bg-amber-100 rounded-full h-2 mt-1 ml-6" style="width: calc(100% - 1.5rem)">
        <div id="file-bar-${i}" class="h-2 bg-amber-500 rounded-full transition-all" style="width:0%"></div>
      </div>
    `;
    fileList.appendChild(item);
  });

  fileList.classList.remove('hidden');
  uploadBtn.classList.remove('hidden');
  lucide.createIcons();
});

function uploadWithProgress(file, index) {
  const statusEl = document.getElementById(`file-status-${index}`);
  const barEl = document.getElementById(`file-bar-${index}`);

  return new Promise(async (resolve) => {
    statusEl.textContent = 'Preparando...';

    try {
      // 1. Pedir la URL firmada al Worker
      const signRes = await fetch(
        `${WORKER_URL}/sign?filename=${encodeURIComponent(file.name)}&size=${file.size}&contentType=${encodeURIComponent(file.type)}`
      );
      const signData = await signRes.json();

      if (signData.error === 'too_large') {
        statusEl.textContent = '✕ Supera los 350MB';
        statusEl.className = 'text-xs text-red-600 mt-1 ml-6';
        barEl.className = 'h-2 bg-red-500 rounded-full';
        return resolve({ status: 'error', name: file.name });
      }

      if (signData.duplicate) {
        statusEl.textContent = '! Ya fue subido antes';
        statusEl.className = 'text-xs text-amber-600 mt-1 ml-6';
        barEl.className = 'h-2 bg-amber-400 rounded-full';
        return resolve({ status: 'duplicate', name: file.name });
      }

      // 2. Subir directo a R2 usando la URL firmada
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signData.url);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          barEl.style.width = `${percent}%`;
          barEl.className = 'h-2 bg-amber-500 rounded-full transition-all';
          statusEl.textContent = `Subiendo... ${percent}%`;
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          statusEl.textContent = '✓ Subido con éxito';
          statusEl.className = 'text-xs text-green-700 mt-1 ml-6';
          barEl.className = 'h-2 bg-green-600 rounded-full';
          resolve({ status: 'ok', name: file.name });
        } else {
          statusEl.textContent = '✕ Error al subir';
          statusEl.className = 'text-xs text-red-600 mt-1 ml-6';
          barEl.className = 'h-2 bg-red-500 rounded-full';
          resolve({ status: 'error', name: file.name });
        }
      };

      xhr.onerror = () => {
        statusEl.textContent = '✕ Error de red';
        statusEl.className = 'text-xs text-red-600 mt-1 ml-6';
        barEl.className = 'h-2 bg-red-500 rounded-full';
        resolve({ status: 'error', name: file.name });
      };

      xhr.send(file);

    } catch (err) {
      statusEl.textContent = '✕ Error de conexión';
      statusEl.className = 'text-xs text-red-600 mt-1 ml-6';
      barEl.className = 'h-2 bg-red-500 rounded-full';
      resolve({ status: 'error', name: file.name });
    }
  });
}

uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  uploadBtn.disabled = true;

  const results = [];
  for (let i = 0; i < selectedFiles.length; i++) {
    const result = await uploadWithProgress(selectedFiles[i], i);
    results.push(result);
  }

  const okCount = results.filter(r => r.status === 'ok').length;
  const dupCount = results.filter(r => r.status === 'duplicate').length;
  const errCount = results.filter(r => r.status === 'error').length;

  if (errCount === 0 && dupCount === 0) {
    showModal({
      icon: 'check-circle-2',
      title: '¡Listo!',
      text: `Se ${results.length === 1 ? 'subió' : 'subieron'} ${results.length} archivo${results.length === 1 ? '' : 's'} con éxito. Gracias por compartir este momento con nosotros.`,
      colorClass: 'text-green-600 font-family'
    });
    resetForm();
  } else if (errCount === 0 && dupCount > 0) {
    showModal({
      icon: 'alert-triangle',
      title: 'Algunos ya existían',
      text: `${okCount} archivo(s) se subieron correctamente. ${dupCount} ya habían sido subidos antes.`,
      colorClass: 'text-amber-500 font-family'
    });
    resetForm();
  } else {
    showModal({
      icon: 'x-circle',
      title: 'Hubo un problema',
      text: `${okCount} subido(s), ${dupCount} duplicado(s), ${errCount} con error. Vuelve a intentar con los archivos marcados en rojo.`,
      colorClass: 'text-red-500 font-family'
    });
    uploadBtn.disabled = false;
  }
});