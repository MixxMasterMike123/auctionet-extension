/**
 * Biography KB Card - SSoT Component
 * Extracted from quality-analyzer.js
 * Handles the artist Knowledge Base card: creation, data fetching,
 * Wikipedia images, disambiguation, and add-to-description.
 */
export class BiographyKBCard {
  constructor() {
    this.apiManager = null;
    this._onReanalyze = null;
  }

  /**
   * Set API manager for biography fetching
   */
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  /**
   * Set callback for re-analysis after adding bio to description
   */
  setCallbacks({ onReanalyze }) {
    this._onReanalyze = onReanalyze;
  }

  /**
   * Normalize artist name casing
   */
  formatName(name) {
    return name
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Add "visa biografi" link next to the artist field
   */
  setupArtistFieldBioHover(artistName, artistDates = '', itemTitle = '', itemDescription = '') {
    if (!artistName || !artistName.trim()) {
      const existing = document.querySelector('.artist-field-bio-link');
      if (existing) existing.remove();
      return;
    }

    const artistField = document.querySelector('#item_artist_name_sv') ||
      document.querySelector('input[name*="artist"]');
    if (!artistField) return;

    const existing = document.querySelector('.artist-field-bio-link');
    if (existing) {
      if (existing.dataset.artist === artistName.trim()) return;
      existing.remove();
    }

    const bioLink = document.createElement('span');
    bioLink.className = 'artist-field-bio-link';
    bioLink.dataset.artist = artistName.trim();
    bioLink.textContent = 'visa biografi';
    bioLink.style.cssText = `
      font-size: 12px;
      color: #1976d2;
      cursor: pointer;
      margin-left: 8px;
      font-style: italic;
      position: relative;
      user-select: none;
    `;

    this.addBiographyHover(bioLink, artistName.trim(), null, artistDates, itemTitle, itemDescription);
    artistField.parentNode.insertBefore(bioLink, artistField.nextSibling);
  }

  /**
   * Add biography hover functionality to an element
   */
  addBiographyHover(element, artistName, warningData = null, artistDates = '', itemTitle = '', itemDescription = '') {
    artistName = this.formatName(artistName);

    let kbCard = null;
    let dataLoaded = false;
    let hideTimeout = null;
    let isHoveringTrigger = false;
    let isHoveringCard = false;

    let existingBio = null;
    if (warningData?.verification?.biography) {
      existingBio = warningData.verification.biography;
    } else if (warningData?.verification?.promise) {
      warningData.verification.promise.then(result => {
        if (result?.biography) existingBio = result.biography;
      }).catch(() => {});
    }

    const positionCard = () => {
      if (!kbCard) return;
      const rect = element.getBoundingClientRect();
      const cardWidth = 300;
      let left = rect.left + rect.width / 2 - cardWidth / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - cardWidth - 8));
      kbCard.style.left = `${left}px`;
      kbCard.style.top = `${rect.bottom + 8}px`;
    };

    const showCard = () => {
      if (!kbCard) return;
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      positionCard();
      kbCard.style.opacity = '1';
      kbCard.style.visibility = 'visible';
      kbCard.style.transform = 'translateY(0) scale(1)';
      kbCard.style.pointerEvents = 'auto';
    };

    const scheduleHide = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isHoveringTrigger && !isHoveringCard && kbCard) {
          kbCard.style.opacity = '0';
          kbCard.style.visibility = 'hidden';
          kbCard.style.transform = 'translateY(6px) scale(0.96)';
          kbCard.style.pointerEvents = 'none';
        }
      }, 150);
    };

    const setupCardHover = () => {
      if (!kbCard || kbCard.dataset.hoverBound) return;
      kbCard.dataset.hoverBound = 'true';
      kbCard.addEventListener('mouseenter', () => {
        isHoveringCard = true;
        if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      });
      kbCard.addEventListener('mouseleave', () => {
        isHoveringCard = false;
        scheduleHide();
      });
    };

    element.addEventListener('mouseenter', async () => {
      isHoveringTrigger = true;

      if (kbCard && dataLoaded) {
        showCard();
        return;
      }

      if (!kbCard) {
        kbCard = this.createKBCard(artistName);
        setupCardHover();
      }
      showCard();

      try {
        const [bioData, imageUrl] = await Promise.all([
          this.fetchArtistBiography(artistName, artistDates, '', itemTitle, itemDescription),
          this.fetchWikipediaImage(artistName)
        ]);
        dataLoaded = true;

        let finalBioData = bioData;
        if (!finalBioData && existingBio) {
          finalBioData = {
            years: null,
            biography: existingBio,
            style: [],
            notableWorks: []
          };
        }

        const refetchWithHint = async (hint) => {
          const bioEl = kbCard.querySelector('.kb-bio');
          if (bioEl) bioEl.innerHTML = '<span class="kb-card-spinner"></span> Söker igen...';
          const tagsEl = kbCard.querySelector('.kb-tags');
          if (tagsEl) tagsEl.innerHTML = '';
          const worksEl = kbCard.querySelector('.kb-works');
          if (worksEl) { worksEl.style.display = 'none'; worksEl.innerHTML = ''; }
          const oldBtn = kbCard.querySelector('.kb-add-bio-btn')?.parentElement;
          if (oldBtn) oldBtn.remove();

          try {
            const [newBio, newImg] = await Promise.all([
              this.fetchArtistBiography(artistName, artistDates, hint, itemTitle, itemDescription),
              this.fetchWikipediaImage(artistName + ' ' + hint)
            ]);
            this.updateKBCard(kbCard, newBio, newImg, refetchWithHint, artistName);
          } catch (e) {
            if (bioEl) bioEl.textContent = 'Sökning misslyckades. Försök igen.';
          }
        };

        this.updateKBCard(kbCard, finalBioData, imageUrl, refetchWithHint, artistName);
      } catch (error) {
        dataLoaded = true;
        if (existingBio) {
          this.updateKBCard(kbCard, { years: null, biography: existingBio, style: [], notableWorks: [] }, null, null, artistName);
        } else {
          this.updateKBCard(kbCard, null, null, null, artistName);
        }
      }
    });

    element.addEventListener('mouseleave', () => {
      isHoveringTrigger = false;
      scheduleHide();
    });
  }

  /**
   * Fetch structured artist biography for KB card
   */
  async fetchArtistBiography(artistName, artistDates = '', userHint = '', itemTitle = '', itemDescription = '') {
    if (!this.apiManager?.apiKey) {
      return null;
    }

    let knownYears = '';
    if (artistDates) {
      const yearsMatch = artistDates.match(/(\d{4})[–-](\d{4})?/);
      if (yearsMatch) {
        knownYears = yearsMatch[0];
      }
    }

    let disambiguationHint = '';
    if (userHint) {
      disambiguationHint = `\nVIKTIGT: Användaren söker specifikt efter en konstnär beskriven som: "${userHint}". Svara om den personen.`;
    } else {
      const contextParts = [];
      if (knownYears) contextParts.push(`Personen levde ${knownYears}.`);
      if (itemTitle) contextParts.push(`Objektets titel: "${itemTitle}".`);
      if (itemDescription) {
        const shortDesc = itemDescription.length > 200 ? itemDescription.substring(0, 200) + '...' : itemDescription;
        contextParts.push(`Beskrivning: "${shortDesc}".`);
      }
      if (contextParts.length > 0) {
        disambiguationHint = `\nKontext från auktionsobjektet (använd för att identifiera rätt person):\n${contextParts.join('\n')}`;
      }
    }

    const prompt = `Konstnär/formgivare: "${artistName}"${disambiguationHint}

Svara med JSON (på svenska):
{
  "years": "födelseår–dödsår eller födelseår–",
  "biography": "kort biografi, max 80 ord",
  "style": ["stilriktning1", "stilriktning2"],
  "notableWorks": ["verk1", "verk2", "verk3"]
}

Regler:
- years: t.ex. "1888–1972" eller "1945–"
- biography: fokusera på karriär och betydelse
- style: max 3 stilar/material/perioder
- notableWorks: max 3 kända verk med årtal om känt
- Om okänd konstnär, returnera null`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: 'claude-opus-4-6',
            max_tokens: 250,
            temperature: 0.2,
            system: 'Du är en konstexpert. Svara ALLTID med valid JSON. Inga kommentarer utanför JSON.',
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error('Biography fetch failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const text = response.data.content[0].text.trim();
        try {
          let jsonStr = text;
          const codeBlockMatch = text.match(/```json?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
          } else {
            const jsonObjMatch = text.match(/\{[\s\S]*\}/);
            if (jsonObjMatch) {
              jsonStr = jsonObjMatch[0];
            }
          }
          const parsed = JSON.parse(jsonStr);
          if (parsed === null) return null;
          return {
            years: parsed.years || null,
            biography: parsed.biography || null,
            style: Array.isArray(parsed.style) ? parsed.style : [],
            notableWorks: Array.isArray(parsed.notableWorks) ? parsed.notableWorks : []
          };
        } catch (parseError) {
          const cleanText = text
            .replace(/```json?\s*/g, '')
            .replace(/```/g, '')
            .replace(/[{}"]/g, '')
            .replace(/^\s*(years|biography|style|notableWorks)\s*:/gm, '')
            .replace(/\[.*?\]/g, '')
            .replace(/,\s*$/gm, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
          return { years: null, biography: cleanText || text, style: [], notableWorks: [] };
        }
      }
    } catch (error) {
      // Silently fail
    }

    return null;
  }

  /**
   * Fetch artist image from Wikipedia (sv first, then en)
   */
  async fetchWikipediaImage(artistName) {
    try {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'wikipedia-fetch',
          artistName: artistName
        }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else if (response?.success && response.imageUrl) {
            resolve(response.imageUrl);
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Create KB-style artist card (loading state)
   */
  createKBCard(artistName) {
    if (!document.querySelector('#kb-card-styles')) {
      const style = document.createElement('style');
      style.id = 'kb-card-styles';
      style.textContent = `
        .kb-card-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: kbSpin 0.6s linear infinite;
          vertical-align: middle;
          margin-right: 8px;
        }
        @keyframes kbSpin {
          to { transform: rotate(360deg); }
        }
        .kb-style-tag {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 11px;
          background: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.85);
          margin: 0 4px 4px 0;
          letter-spacing: 0.3px;
        }
        .kb-notable-item {
          padding: 2px 0;
          font-size: 11.5px;
          color: rgba(255,255,255,0.8);
        }
        .kb-notable-item::before {
          content: "\\2022";
          margin-right: 6px;
          color: rgba(255,255,255,0.4);
        }
      `;
      document.head.appendChild(style);
    }

    const formattedName = this.formatName(artistName);
    const initials = formattedName.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const card = document.createElement('div');
    card.className = 'artist-kb-card';

    card.innerHTML = `
      <div class="kb-photo-area">
        <div class="kb-avatar">${initials}</div>
      </div>
      <div class="kb-header">
        <div class="kb-name">${formattedName}</div>
        <div class="kb-years"></div>
      </div>
      <div class="kb-bio">
        <span class="kb-card-spinner"></span> Letar information...
      </div>
      <div class="kb-tags"></div>
      <div class="kb-works"></div>
    `;

    card.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      transform: translateY(6px) scale(0.96);
      background: rgba(20, 20, 30, 0.96);
      backdrop-filter: blur(16px);
      color: white;
      padding: 16px 18px 14px;
      border-radius: 14px;
      width: 300px;
      white-space: normal;
      word-wrap: break-word;
      box-shadow:
        0 8px 40px rgba(0, 0, 0, 0.25),
        0 2px 8px rgba(0, 0, 0, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
      z-index: 2147483647;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                  transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                  visibility 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      text-align: left;
      border: 1px solid rgba(255, 255, 255, 0.06);
    `;

    const photoArea = card.querySelector('.kb-photo-area');
    photoArea.style.cssText = 'text-align: center; margin-bottom: 10px;';

    const avatar = card.querySelector('.kb-avatar');
    avatar.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4a5568, #2d3748);
      color: rgba(255,255,255,0.7);
      font-size: 24px;
      font-weight: 600;
      letter-spacing: 1px;
      border: 2px solid rgba(255,255,255,0.1);
    `;

    const nameEl = card.querySelector('.kb-name');
    nameEl.style.cssText = 'font-size: 15px; font-weight: 600; text-align: center; letter-spacing: 0.3px;';

    const yearsEl = card.querySelector('.kb-years');
    yearsEl.style.cssText = 'font-size: 12px; color: rgba(255,255,255,0.5); text-align: center; margin-bottom: 10px;';

    const bioEl = card.querySelector('.kb-bio');
    bioEl.style.cssText = 'font-size: 12px; line-height: 1.5; color: rgba(255,255,255,0.85); margin-bottom: 8px;';

    card.querySelector('.kb-tags').style.cssText = 'margin-bottom: 6px;';
    card.querySelector('.kb-works').style.cssText = 'display: none;';

    document.body.appendChild(card);
    return card;
  }

  /**
   * Update KB card with fetched data
   */
  updateKBCard(card, bioData, imageUrl, refetchCallback = null, artistName = '') {
    if (!card) return;

    const photoArea = card.querySelector('.kb-photo-area');
    if (imageUrl && photoArea && !photoArea.querySelector('img')) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = '';
      img.style.cssText = 'width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.15);';
      img.onerror = () => {};
      img.onload = () => {
        const existingImgs = photoArea.querySelectorAll('img');
        existingImgs.forEach(i => i.remove());
        const avatar = photoArea.querySelector('.kb-avatar');
        if (avatar) avatar.remove();
        photoArea.prepend(img);
      };
    }

    if (!bioData) {
      const bioEl = card.querySelector('.kb-bio');
      if (bioEl) bioEl.textContent = 'Ingen information tillgänglig.';
      return;
    }

    if (bioData.years) {
      const yearsEl = card.querySelector('.kb-years');
      if (yearsEl) yearsEl.textContent = bioData.years;
    }

    const bioEl = card.querySelector('.kb-bio');
    if (bioEl) {
      bioEl.textContent = bioData.biography || 'Ingen biografi tillgänglig.';
    }

    if (bioData.style && bioData.style.length > 0) {
      const tagsEl = card.querySelector('.kb-tags');
      if (tagsEl) {
        tagsEl.innerHTML = bioData.style
          .map(s => `<span class="kb-style-tag">${s}</span>`)
          .join('');
      }
    }

    if (bioData.notableWorks && bioData.notableWorks.length > 0) {
      const worksEl = card.querySelector('.kb-works');
      if (worksEl) {
        worksEl.style.display = 'block';
        worksEl.style.cssText += 'margin-top: 6px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);';
        worksEl.innerHTML = `
          <div style="font-size: 11px; color: rgba(255,255,255,0.45); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Kända verk</div>
          ${bioData.notableWorks.map(w => `<div class="kb-notable-item">${w}</div>`).join('')}
        `;
      }
    }

    // Add "Lägg till biografi" button
    if (bioData.biography && !card.querySelector('.kb-add-bio-btn')) {
      const btnArea = document.createElement('div');
      btnArea.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;';

      const btn = document.createElement('button');
      btn.className = 'kb-add-bio-btn';
      btn.textContent = 'Lägg till biografi i beskrivning';
      btn.type = 'button';
      btn.style.cssText = 'background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 7px 14px; font-size: 12px; cursor: pointer; transition: all 0.15s ease; width: 100%; font-family: inherit;';
      btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.2)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.12)'; });
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const descField = document.querySelector('#item_description_sv');
        if (descField) {
          const cardArtistName = card.querySelector('.kb-name')?.textContent || '';
          const years = card.querySelector('.kb-years')?.textContent || '';
          const bioLine = years
            ? `${cardArtistName} (${years}). ${bioData.biography}`
            : `${cardArtistName}. ${bioData.biography}`;

          const current = descField.value.trim();
          descField.value = current ? `${current}\n\n${bioLine}` : bioLine;
          descField.dispatchEvent(new Event('input', { bubbles: true }));

          btn.textContent = 'Tillagd i beskrivning';
          btn.style.background = 'rgba(76, 175, 80, 0.3)';
          btn.style.borderColor = 'rgba(76, 175, 80, 0.5)';
          btn.disabled = true;
          setTimeout(() => {
            btn.textContent = 'Lägg till biografi i beskrivning';
            btn.style.background = 'rgba(255,255,255,0.12)';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.disabled = false;
          }, 2000);
        }
      });

      btnArea.appendChild(btn);
      card.appendChild(btnArea);
    }

    // "Fel person?" section
    if (!card.querySelector('.kb-wrong-person') && (bioData || refetchCallback)) {
      const wrongSection = document.createElement('div');
      wrongSection.className = 'kb-wrong-person';
      wrongSection.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08); text-align: center;';

      const toggleLink = document.createElement('span');
      toggleLink.textContent = 'Fel person?';
      toggleLink.style.cssText = 'font-size: 11px; color: rgba(255,255,255,0.4); cursor: pointer; transition: color 0.15s;';
      toggleLink.addEventListener('mouseenter', () => { toggleLink.style.color = 'rgba(255,255,255,0.7)'; });
      toggleLink.addEventListener('mouseleave', () => { toggleLink.style.color = 'rgba(255,255,255,0.4)'; });

      const panel = document.createElement('div');
      panel.style.cssText = 'display: none; margin-top: 8px; text-align: left;';

      if (refetchCallback) {
        const hintRow = document.createElement('div');
        hintRow.style.cssText = 'display: flex; gap: 6px; margin-bottom: 8px;';

        const hintInput = document.createElement('input');
        hintInput.type = 'text';
        hintInput.placeholder = 'T.ex. "popkonstnär, samtida"';
        hintInput.style.cssText = 'flex: 1; padding: 5px 8px; font-size: 11px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: rgba(255,255,255,0.9); outline: none; font-family: inherit;';
        hintInput.addEventListener('focus', () => { hintInput.style.borderColor = 'rgba(25,118,210,0.5)'; });
        hintInput.addEventListener('blur', () => { hintInput.style.borderColor = 'rgba(255,255,255,0.15)'; });

        const searchBtn = document.createElement('button');
        searchBtn.type = 'button';
        searchBtn.textContent = 'Sök';
        searchBtn.style.cssText = 'padding: 5px 10px; font-size: 11px; background: rgba(25,118,210,0.3); color: rgba(255,255,255,0.9); border: 1px solid rgba(25,118,210,0.4); border-radius: 6px; cursor: pointer; font-family: inherit; transition: background 0.15s; white-space: nowrap;';
        searchBtn.addEventListener('mouseenter', () => { searchBtn.style.background = 'rgba(25,118,210,0.5)'; });
        searchBtn.addEventListener('mouseleave', () => { searchBtn.style.background = 'rgba(25,118,210,0.3)'; });

        const doSearch = () => {
          const hint = hintInput.value.trim();
          if (hint) {
            wrongSection.remove();
            refetchCallback(hint);
          }
        };

        searchBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); doSearch(); });
        hintInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

        hintRow.appendChild(hintInput);
        hintRow.appendChild(searchBtn);
        panel.appendChild(hintRow);
      }

      const encodedName = encodeURIComponent(artistName || card.querySelector('.kb-name')?.textContent || '');
      const linksRow = document.createElement('div');
      linksRow.style.cssText = 'display: flex; gap: 10px; justify-content: center; font-size: 11px;';
      linksRow.innerHTML = `
        <a href="https://www.google.com/search?q=${encodedName}+konstnär" target="_blank" rel="noopener"
           style="color: rgba(255,255,255,0.45); text-decoration: none; transition: color 0.15s;"
           onmouseenter="this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.color='rgba(255,255,255,0.45)'"
        >Sök Google</a>
        <a href="https://sv.wikipedia.org/wiki/${encodedName.replace(/%20/g, '_')}" target="_blank" rel="noopener"
           style="color: rgba(255,255,255,0.45); text-decoration: none; transition: color 0.15s;"
           onmouseenter="this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.color='rgba(255,255,255,0.45)'"
        >Wikipedia</a>
        <a href="https://www.artnet.com/artists/${encodedName.replace(/%20/g, '-').toLowerCase()}/" target="_blank" rel="noopener"
           style="color: rgba(255,255,255,0.45); text-decoration: none; transition: color 0.15s;"
           onmouseenter="this.style.color='rgba(255,255,255,0.8)'" onmouseleave="this.style.color='rgba(255,255,255,0.45)'"
        >Artnet</a>
      `;
      panel.appendChild(linksRow);

      toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        toggleLink.textContent = isVisible ? 'Fel person?' : 'Dölj';
        if (!isVisible) {
          const input = panel.querySelector('input');
          if (input) setTimeout(() => input.focus(), 50);
        }
      });

      wrongSection.appendChild(toggleLink);
      wrongSection.appendChild(panel);
      card.appendChild(wrongSection);
    }
  }

  /**
   * Show artist biography modal (older/simpler style)
   */
  async showArtistBiography(artistName) {
    try {
      if (!this.apiManager?.apiKey) {
        alert('API-nyckel saknas för att hämta biografi');
        return;
      }

      const prompt = `Skriv en kort biografi (max 200 ord) på svenska om konstnären "${artistName}". Fokusera på viktiga datum, stil och kända verk. Svara endast med biografin, inga extra kommentarer.`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id,
            max_tokens: 300,
            temperature: 0.3,
            system: 'Du är en konstexpert. Skriv korta, faktabaserade biografier på svenska.',
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error('Biography fetch failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const biography = response.data.content[0].text;
        this.showBiographyModal(artistName, biography);
      }
    } catch (error) {
      console.error('Error fetching biography:', error);
      alert('Kunde inte hämta biografi för ' + artistName);
    }
  }

  /**
   * Show biography in modal
   */
  showBiographyModal(artistName, biography) {
    const modal = document.createElement('div');
    modal.className = 'artist-bio-modal-overlay';
    modal.innerHTML = `
      <div class="artist-bio-modal">
        <div class="artist-bio-header">
          <h3>🎨 ${artistName}</h3>
          <button class="close-bio-modal">&times;</button>
        </div>
        <div class="artist-bio-content">
          <p>${biography}</p>
          <div class="bio-actions">
            <button class="btn-add-bio-to-description">📝 Lägg till i beskrivning</button>
            <button class="btn-close-bio">Stäng</button>
          </div>
        </div>
      </div>
    `;

    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000; backdrop-filter: blur(4px);';

    const modalContent = modal.querySelector('.artist-bio-modal');
    modalContent.style.cssText = 'background: white; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.3);';

    const header = modal.querySelector('.artist-bio-header');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid #eee; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px 12px 0 0;';

    const closeBtn = modal.querySelector('.close-bio-modal');
    closeBtn.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; color: #666; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;';

    modal.querySelector('.artist-bio-content').style.cssText = 'padding: 20px;';
    modal.querySelector('.bio-actions').style.cssText = 'display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;';

    modal.querySelectorAll('.bio-actions button').forEach(btn => {
      btn.style.cssText = 'padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s ease;';
    });

    modal.querySelector('.btn-add-bio-to-description').style.cssText += 'background: #4caf50; color: white;';
    modal.querySelector('.btn-close-bio').style.cssText += 'background: #f5f5f5; color: #333;';

    document.body.appendChild(modal);

    modal.querySelectorAll('.close-bio-modal, .btn-close-bio').forEach(btn => {
      btn.addEventListener('click', () => document.body.removeChild(modal));
    });

    modal.querySelector('.btn-add-bio-to-description').addEventListener('click', () => {
      this.addBiographyToDescription(biography);
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    });
  }

  /**
   * Add biography to description field
   */
  addBiographyToDescription(biography) {
    const descriptionField = document.querySelector('#item_description_sv');
    if (descriptionField) {
      const currentDesc = descriptionField.value || '';
      const newDesc = currentDesc + (currentDesc ? '\n\n' : '') + biography;
      descriptionField.value = newDesc;
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }));

      if (this._onReanalyze) {
        setTimeout(() => this._onReanalyze(), 500);
      }
    }
  }
}
