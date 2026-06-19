const WORKER_URL = 'https://boda-uploader.infoiterabyd.workers.dev';
const MAX_SIZE_MB = 50;

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
  selectedFiles = [...fileInput.files].filter(f => {
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

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', WORKER_URL);
    xhr.setRequestHeader('X-Filename', file.name);
    xhr.setRequestHeader('Content-Type', file.type);

    statusEl.textContent = 'Subiendo... 0%';

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        barEl.style.width = `${percent}%`;
        statusEl.textContent = `Subiendo... ${percent}%`;
      }
    });

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (data.duplicate) {
          statusEl.textContent = '⚠️ Ya fue subido antes';
          statusEl.className = 'text-xs text-amber-600 mt-1';
          barEl.className = 'h-2 bg-amber-400 rounded-full';
          resolve({ status: 'duplicate', name: file.name });
        } else if (data.ok) {
          statusEl.textContent = '✅ Subido con éxito';
          statusEl.className = 'text-xs text-green-700 mt-1';
          barEl.className = 'h-2 bg-green-600 rounded-full';
          resolve({ status: 'ok', name: file.name });
        } else {
          throw new Error('server error');
        }
      } catch (err) {
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
