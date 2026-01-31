// Konfiguracja GitHub
const GITHUB_CONFIG = {
    user: 'Luszian',
    repo: 'analiza-cen',
    file: 'raport.json'
};

// Reguły kategorii
const CATEGORY_RULES = [
    { id: 'wozki_el', label: 'Wózki Elektryczne', keywords: ['elektryczny', 'napędem elektrycznym', 'q200', 'q500', 'e60', 'twist', 'ichair', 'mc3', 'mc2'] },
    { id: 'wozki_man', label: 'Wózki Ręczne', keywords: ['ręczny', 'lekki', 'aktywny', 'standardowy', 'vermeiren'] },
    { id: 'skutery', label: 'Skutery', keywords: ['skuter', 'scooter'] },
    { id: 'podnosniki', label: 'Podnośniki', keywords: ['podnośnik', 'pionizator'] },
    { id: 'lozka', label: 'Łóżka', keywords: ['łóżko', 'rehabilitacyjne'] },
    { id: 'inne', label: 'Inne', keywords: [] }
];

// Stan aplikacji
let allProducts = [];
let initialStates = [];
let modifiedCount = 0;
let currentCategory = 'all';
let expandedHidden = {};

// --- FUNKCJE MOTYWU (DARK MODE) ---

function updateTheme() {
    const isDark = localStorage.getItem('theme') !== 'light';
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.querySelectorAll('.sunIcon').forEach(el => el.classList.remove('hidden'));
        document.querySelectorAll('.moonIcon').forEach(el => el.classList.add('hidden'));
    } else {
        document.documentElement.classList.remove('dark');
        document.querySelectorAll('.sunIcon').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.moonIcon').forEach(el => el.classList.remove('hidden'));
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    updateTheme();
}

// --- FUNKCJE FILTROWANIA I KATEGORII ---

function toggleMobileFilters() {
    const tabs = document.getElementById('categoryTabs');
    const chevron = document.getElementById('filterChevron');
    if (tabs.classList.contains('hidden')) {
        tabs.classList.replace('hidden', 'flex');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        tabs.classList.replace('flex', 'hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

function detectCategory(name) {
    const lowerName = name.toLowerCase();
    for (const rule of CATEGORY_RULES) {
        if (rule.id === 'inne') continue;
        if (rule.keywords.some(k => lowerName.includes(k))) return rule.id;
    }
    return 'inne';
}

function renderCategories() {
    const container = document.getElementById('categoryTabs');
    const counts = { all: allProducts.length };
    allProducts.forEach(p => counts[p.category] = (counts[p.category] || 0) + 1);

    let html = `<button onclick="setCategory('all')" class="whitespace-nowrap px-4 py-2.5 md:py-2 rounded-xl text-xs font-bold transition-all text-left md:text-center ${currentCategory === 'all' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">Wszystko (${counts.all})</button>`;

    CATEGORY_RULES.forEach(rule => {
        const count = counts[rule.id] || 0;
        if (count > 0) {
            html += `<button onclick="setCategory('${rule.id}')" class="whitespace-nowrap px-4 py-2.5 md:py-2 rounded-xl text-xs font-bold transition-all text-left md:text-center ${currentCategory === rule.id ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">${rule.label} (${count})</button>`;
        }
    });
    container.innerHTML = html;
}

function setCategory(cat) {
    currentCategory = cat;
    renderCategories();
    renderDashboard();
    if (window.innerWidth < 768) toggleMobileFilters();
}

// --- POBIERANIE DANYCH ---

async function fetchFromGitHub() {
    const refreshIcon = document.getElementById('refreshIcon');
    refreshIcon.classList.add('animate-spin-custom');

    const url = `https://raw.githubusercontent.com/${GITHUB_CONFIG.user}/${GITHUB_CONFIG.repo}/main/${GITHUB_CONFIG.file}?t=${new Date().getTime()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Błąd pobierania');
        const rawData = await response.json();

        initialStates = JSON.parse(JSON.stringify(rawData));

        allProducts = rawData.map(p => ({
            ...p,
            category: detectCategory(p.nazwa_mbmedica),
            internal_konkurencja: parseCompetition(p)
        }));

        recalculateModifiedCount();
        updateExportUI();
        renderCategories();
        renderDashboard();
        document.getElementById('emptyState').classList.add('hidden');
        setTimeout(() => refreshIcon.classList.remove('animate-spin-custom'), 600);
    } catch (err) {
        console.error(err);
        alert('Nie udało się pobrać danych z GitHub.');
    }
}

function parseCompetition(product) {
    const konkurencja = [];
    for (let i = 1; i <= 20; i++) {
        if (product[`sklep_${i}`]) {
            konkurencja.push({
                id: i,
                sklep: product[`sklep_${i}`],
                nazwa_u_konkurencji: product[`sklep_${i}_nazwa`] || '',
                cena: product[`sklep_${i}_cena`] || 0,
                valid: product[`sklep_${i}_valid`] !== false
            });
        }
    }
    return konkurencja;
}

// --- LOGIKA MODYFIKACJI I EKSPORTU ---

function markOfferAsInvalid(pIdx, shopId) {
    const product = allProducts[pIdx];
    if (product) {
        product[`sklep_${shopId}_valid`] = false;
        const comp = product.internal_konkurencja.find(c => c.id === shopId);
        if (comp) comp.valid = false;
        recalculateModifiedCount();
        updateExportUI();
        renderDashboard();
    }
}

function restoreOffer(pIdx, shopId) {
    const product = allProducts[pIdx];
    if (product) {
        delete product[`sklep_${shopId}_valid`];
        const comp = product.internal_konkurencja.find(c => c.id === shopId);
        if (comp) comp.valid = true;
        recalculateModifiedCount();
        updateExportUI();
        renderDashboard();
    }
}

function recalculateModifiedCount() {
    let diffs = 0;
    allProducts.forEach((p, idx) => {
        const initial = initialStates[idx];
        for (let i = 1; i <= 20; i++) {
            const key = `sklep_${i}_valid`;
            if (p[key] !== initial[key]) {
                diffs++;
            }
        }
    });
    modifiedCount = diffs;
}

function toggleHiddenSection(pIdx) {
    expandedHidden[pIdx] = !expandedHidden[pIdx];
    renderDashboard();
}

function updateExportUI() {
    const container = document.getElementById('exportContainer');
    const counter = document.getElementById('changeCounter');
    if (modifiedCount > 0) {
        container.classList.remove('hidden');
        counter.innerText = `${modifiedCount} NOWYCH ZMIAN`;
    } else {
        container.classList.add('hidden');
    }
}

function exportModifiedJson() {
    const dataToExport = allProducts.map(p => {
        const newObj = {};
        newObj.nazwa_mbmedica = p.nazwa_mbmedica;
        newObj.url_mbmedica = p.url_mbmedica;
        newObj.cena_mbmedica = p.cena_mbmedica;
        newObj.link_google_shopping = p.link_google_shopping;

        for (let i = 1; i <= 20; i++) {
            if (p[`sklep_${i}`]) {
                newObj[`sklep_${i}`] = p[`sklep_${i}`];
                newObj[`sklep_${i}_nazwa`] = p[`sklep_${i}_nazwa`];
                newObj[`sklep_${i}_cena`] = p[`sklep_${i}_cena`];
                if (p[`sklep_${i}_valid`] === false) {
                    newObj[`sklep_${i}_valid`] = false;
                }
            }
        }

        Object.keys(p).forEach(key => {
            if (!newObj.hasOwnProperty(key) && key !== 'category' && key !== 'internal_konkurencja') {
                newObj[key] = p[key];
            }
        });
        return newObj;
    });

    const blob = new Blob([JSON.stringify(dataToExport, null, 4)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `raport_poprawiony_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

// --- RENDEROWANIE INTERFEJSU ---

function renderDashboard() {
    const grid = document.getElementById('mainGrid');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    grid.innerHTML = '';

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.nazwa_mbmedica.toLowerCase().includes(searchTerm);
        const matchesCategory = currentCategory === 'all' || p.category === currentCategory;
        return matchesSearch && matchesCategory;
    });

    filtered.forEach((item) => {
        const realIndex = allProducts.indexOf(item);
        const activeComp = item.internal_konkurencja
            .filter(c => c.sklep.toLowerCase() !== 'mbmedica.pl' && c.valid !== false)
            .sort((a, b) => a.cena - b.cena);

        const hiddenComp = item.internal_konkurencja
            .filter(c => c.sklep.toLowerCase() !== 'mbmedica.pl' && c.valid === false);

        const minPrice = activeComp.length > 0 ? activeComp[0].cena : item.cena_mbmedica;
        const isLowest = item.cena_mbmedica <= minPrice;
        const isExpanded = expandedHidden[realIndex] || false;

        const card = document.createElement('div');
        card.className = `product-card bg-white dark:bg-slate-900 rounded-[1.5rem] border ${isLowest ? 'border-emerald-200 dark:border-emerald-900/40 shadow-emerald-500/5' : 'border-slate-200 dark:border-slate-800'} overflow-hidden flex flex-col md:flex-row shadow-sm`;

        card.innerHTML = `
            <div class="p-5 md:p-8 md:w-1/3 flex flex-col border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                <div class="flex items-center justify-between mb-4">
                    <span class="text-[9px] font-black px-3 py-1 rounded-full ${isLowest ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'} uppercase border tracking-widest">${isLowest ? 'Lider' : 'Popraw cenę'}</span>
                    <div class="flex gap-4">
                        <a href="${item.link_google_shopping}" target="_blank" class="text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></a>
                        <a href="${item.url_mbmedica}" target="_blank" class="text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>
                    </div>
                </div>
                <h3 class="font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base leading-tight mb-2">${item.nazwa_mbmedica}</h3>
                <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                    <div>
                        <p class="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Twoja cena</p>
                        <p class="text-xl font-black text-slate-900 dark:text-white">${item.cena_mbmedica.toLocaleString('pl-PL')} zł</p>
                    </div>
                    <div class="text-right pl-4 border-l border-slate-100 dark:border-slate-700">
                        <p class="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Najniższa</p>
                        <p class="text-sm md:text-base font-bold ${isLowest ? 'text-emerald-600' : 'text-red-500'}">${minPrice.toLocaleString('pl-PL')} zł</p>
                    </div>
                </div>
            </div>
            
            <div class="flex-1 p-5 md:p-8 flex flex-col gap-2">
                <div class="hidden md:flex text-[9px] font-black text-slate-400 uppercase px-4 mb-2 tracking-widest">
                    <div class="w-40">Sklep</div>
                    <div class="flex-1">Nazwa produktu</div>
                    <div class="w-32 text-right">Cena</div>
                </div>

                ${activeComp.map((c) => `
                    <div class="flex flex-col md:flex-row md:items-center px-4 py-3 rounded-xl bg-slate-50/40 dark:bg-slate-800/30 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all gap-2">
                        <div class="w-full md:w-40 text-xs font-extrabold text-slate-900 dark:text-slate-100">${c.sklep}</div>
                        <div class="flex-1 text-[11px] text-slate-500 dark:text-slate-400">${c.nazwa_u_konkurencji}</div>
                        <div class="flex items-center justify-between md:justify-end md:w-40 gap-4 border-t md:border-0 pt-2 md:pt-0 mt-1 md:mt-0">
                            <span class="text-[13px] font-black ${c.cena < item.cena_mbmedica ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}">${c.cena.toLocaleString('pl-PL')} zł</span>
                            <button onclick="markOfferAsInvalid(${realIndex}, ${c.id})" class="p-2 text-slate-400 hover:text-red-500 bg-slate-100 dark:bg-slate-700/50 md:bg-transparent rounded-lg transition-colors" title="Ukryj ofertę">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                `).join('')}

                ${hiddenComp.length > 0 ? `
                    <div class="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                        <button onclick="toggleHiddenSection(${realIndex})" class="flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors uppercase tracking-widest">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                            Pokaż ukryte oferty (${hiddenComp.length})
                        </button>
                        
                        ${isExpanded ? `
                            <div class="mt-3 flex flex-col gap-2 opacity-60">
                                ${hiddenComp.map((c) => `
                                    <div class="flex flex-col md:flex-row md:items-center px-4 py-2 rounded-xl bg-slate-100/50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-700 gap-2">
                                        <div class="w-full md:w-40 text-[11px] font-bold text-slate-500">${c.sklep}</div>
                                        <div class="flex-1 text-[10px] text-slate-400 italic line-clamp-1">${c.nazwa_u_konkurencji}</div>
                                        <div class="flex items-center justify-between md:justify-end md:w-40 gap-4">
                                            <span class="text-[11px] font-bold text-slate-400 line-through">${c.cena.toLocaleString('pl-PL')} zł</span>
                                            <button onclick="restoreOffer(${realIndex}, ${c.id})" class="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-md hover:bg-blue-100 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9" /></svg>
                                                PRZYWRÓĆ
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- OBSŁUGA ZDARZEŃ (EVENT LISTENERS) ---

document.addEventListener('DOMContentLoaded', () => {
    // Inicjalizacja motywu
    updateTheme();

    // Wyszukiwanie
    document.getElementById('searchInput').addEventListener('input', renderDashboard);

    // Przełączanie motywu
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('themeToggleMobile').addEventListener('click', toggleTheme);

    // Odświeżanie
    document.getElementById('refreshBtn').addEventListener('click', fetchFromGitHub);

    // Filtry mobilne
    document.getElementById('mobileFilterToggle').addEventListener('click', toggleMobileFilters);

    // Eksport JSON
    document.getElementById('exportBtn').addEventListener('click', exportModifiedJson);

    // Pierwsze pobranie danych
    fetchFromGitHub();
});