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

function resetForm() {
  selectedFiles = [];
  fileInput.value = '';
  fileList.innerHTML = '';
  fileList.classList.add('hidden');
  uploadBtn.classList.add('hidden');
  uploadBtn.disabled = false;
}

function showModal({ icon, title, text }) {
  modalIcon.textContent = icon;
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalOverlay.classList.remove('hidden');
}

modalCloseBtn.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
});

fileInput.addEventListener('change', () => {
  let files = [...fileInput.files];

  // Límite de cantidad de archivos por subida
  if (files.length > MAX_FILES_PER_BATCH) {
    alert(`Solo puedes subir un máximo de ${MAX_FILES_PER_BATCH} archivos por vez. Se tomarán los primeros ${MAX_FILES_PER_BATCH}.`);
    files = files.slice(0, MAX_FILES_PER_BATCH);
  }

  // Límite de tamaño por archivo
  selectedFiles = files.filter(f => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`"${f.name}" supera los ${MAX_SIZE_MB}MB y fue omitido.`);
      return false;
    }
    return true;
  });

  fileList.innerHTML = '';
  if (selectedFiles.length === 0) {
    fileList.classList.add('hidden');
    uploadBtn.classList.add('hidden');
    return;
  }

  selectedFiles.forEach((f, i) => {
    const item = document.createElement('div');
    item.id = `file-item-${i}`;
    item.className = 'bg-cream rounded-lg px-3 py-2 border border-olive/10';

    item.innerHTML = `
      <p class="text-sm text-olive/90 truncate">📄 ${f.name} <span class="text-olive/50">(${(f.size / 1024 / 1024).toFixed(1)} MB)</span></p>
      <p id="file-status-${i}" class="text-xs text-olive/50 mt-1">En espera...</p>
      <div class="w-full bg-olive/10 rounded-full h-2 mt-1">
        <div id="file-bar-${i}" class="h-2 bg-olive rounded-full transition-all" style="width:0%"></div>
      </div>
    `;
    fileList.appendChild(item);
  });

  fileList.classList.remove('hidden');
  uploadBtn.classList.remove('hidden');
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
        statusEl.textContent = '❌ Supera los 350MB';
        statusEl.className = 'text-xs text-red-600 mt-1';
        barEl.className = 'h-2 bg-red-500 rounded-full';
        return resolve({ status: 'error', name: file.name });
      }

      if (signData.duplicate) {
        statusEl.textContent = '⚠️ Ya fue subido antes';
        statusEl.className = 'text-xs text-amber-600 mt-1';
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
          statusEl.textContent = `Subiendo... ${percent}%`;
        }
      });

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          statusEl.textContent = '✅ Subido con éxito';
          statusEl.className = 'text-xs text-green-700 mt-1';
          barEl.className = 'h-2 bg-green-600 rounded-full';
          resolve({ status: 'ok', name: file.name });
        } else {
          statusEl.textContent = '❌ Error al subir';
          statusEl.className = 'text-xs text-red-600 mt-1';
          barEl.className = 'h-2 bg-red-500 rounded-full';
          resolve({ status: 'error', name: file.name });
        }
      };

      xhr.onerror = () => {
        statusEl.textContent = '❌ Error de red';
        statusEl.className = 'text-xs text-red-600 mt-1';
        barEl.className = 'h-2 bg-red-500 rounded-full';
        resolve({ status: 'error', name: file.name });
      };

      xhr.send(file);

    } catch (err) {
      statusEl.textContent = '❌ Error de conexión';
      statusEl.className = 'text-xs text-red-600 mt-1';
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
      icon: '✅',
      title: '¡Listo!',
      text: `Se ${results.length === 1 ? 'subió' : 'subieron'} ${results.length} archivo${results.length === 1 ? '' : 's'} con éxito. Gracias por compartir este momento con nosotros.`
    });
    resetForm();
  } else if (errCount === 0 && dupCount > 0) {
    showModal({
      icon: '⚠️',
      title: 'Algunos ya existían',
      text: `${okCount} archivo(s) se subieron correctamente. ${dupCount} ya habían sido subidos antes.`
    });
    resetForm();
  } else {
    showModal({
      icon: '❌',
      title: 'Hubo un problema',
      text: `${okCount} subido(s), ${dupCount} duplicado(s), ${errCount} con error. Vuelve a intentar con los archivos marcados en rojo.`
    });
    uploadBtn.disabled = false;
  }
});