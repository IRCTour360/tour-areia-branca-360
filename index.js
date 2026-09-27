'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  var currentSceneName = 'Elevador';

  // =========================================================
  // RASTREAMENTO AVANÇADO DE COMPORTAMENTO PARA O CLARITY
  // =========================================================
  var visitedRoomsList = [];
  var openedInfoList = [];
  var leadConverted = false;
  var sessionStartTime = Date.now();

  function sendTagToClarity(key, value) {
    if (window.clarity) {
      window.clarity("set", key, String(value));
    }
  }

  function sendEventToClarity(eventName) {
    if (window.clarity) {
      window.clarity("event", eventName);
    }
  }

  // Registra dados iniciais do visitante (Novo vs Retorno, Origem e Tela)
  (function initVisitorIntelligence() {
    var visits = parseInt(localStorage.getItem('irctour_visits_count') || '0', 10) + 1;
    localStorage.setItem('irctour_visits_count', visits);

    var visitorStatus = visits === 1 ? '1a Visita (Novo)' : 'Retorno (' + visits + 'a Visita)';
    var urlParams = new URLSearchParams(window.location.search);
    var utmSource = urlParams.get('origem') || urlParams.get('utm_source');
    var ua = navigator.userAgent || '';

    var trafficSource = 'Link Direto / WhatsApp';
    if (utmSource) {
      trafficSource = 'Campanha: ' + utmSource;
    } else if (/Instagram/i.test(ua)) {
      trafficSource = 'Instagram (App)';
    } else if (/FBAN|FBAV/i.test(ua)) {
      trafficSource = 'Facebook (App)';
    } else if (document.referrer) {
      trafficSource = document.referrer;
    }

    // Aguarda o Clarity carregar e grava na aba "Informações"
    setTimeout(function() {
      sendTagToClarity('Tipo_Visitante', visitorStatus);
      sendTagToClarity('Origem_Acesso', trafficSource);
      sendTagToClarity('Resolucao_Tela', window.screen.width + 'x' + window.screen.height);
      sendTagToClarity('Nivel_Interesse', '1 - Curioso (Olhou rapido)');
    }, 1500);
  })();

  // Atualiza automaticamente o "Termômetro de Interesse" conforme o cliente explora o apê
  function evaluateEngagementLevel() {
    if (leadConverted) {
      sendTagToClarity('Nivel_Interesse', '4 - LEAD CONVERTIDO (Liberou WhatsApp)');
      return;
    }
    var elapsedSeconds = Math.round((Date.now() - sessionStartTime) / 1000);
    var roomsCount = visitedRoomsList.length;

    if (roomsCount >= 8 || elapsedSeconds >= 180) {
      sendTagToClarity('Nivel_Interesse', '3 - Muito Quente (Explorou grande parte)');
    } else if (roomsCount >= 4 || elapsedSeconds >= 60) {
      sendTagToClarity('Nivel_Interesse', '2 - Interessado (Navegou pelo imovel)');
    }
  }

  setInterval(evaluateEngagementLevel, 15000);

  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
      sendEventToClarity('Clicou_Tela_Cheia');
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  sceneListToggleElement.addEventListener('click', toggleSceneList);

  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    if (el) {
      el.addEventListener('click', function() {
        switchScene(scene);
        if (document.body.classList.contains('mobile')) {
          hideSceneList();
        }
      });
    }
  });

  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  var velocity = 0.7;
  var friction = 3;

  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    currentSceneName = scene.data.name;
    sceneNameElement.innerHTML = sanitize(scene.data.name);

    // Registra histórico completo e quantidade de cômodos visitados no Clarity
    if (visitedRoomsList.indexOf(scene.data.name) === -1) {
      visitedRoomsList.push(scene.data.name);
    }
    sendTagToClarity('Ultimo_Comodo', scene.data.name);
    sendTagToClarity('Qtd_Comodos_Vistos', visitedRoomsList.length + ' de ' + scenes.length + ' ambientes');
    sendTagToClarity('Comodos_Visitados', visitedRoomsList.join(' | '));
    evaluateEngagementLevel();
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    stopTouchAndScrollEventPropagation(wrapper);

    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    wrapper.appendChild(header);
    wrapper.appendChild(text);

    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
      if (wrapper.classList.contains('visible')) {
        if (openedInfoList.indexOf(hotspot.title) === -1) {
          openedInfoList.push(hotspot.title);
        }
        sendTagToClarity('Infos_Abertas', openedInfoList.join(' | '));
        sendEventToClarity('Abriu_Info_' + hotspot.title);
      }
    };

    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  function stopTouchAndScrollEventPropagation(element) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // =========================================================
  // SISTEMA DE BLOQUEIO DE CONTATO, MÁSCARA E NOTIFICAÇÃO
  // =========================================================
  var contactBtn = document.getElementById('propertyContactBtn');
  var creatorBadge = document.getElementById('creatorBadge');
  var modalOverlay = document.getElementById('contactModalOverlay');
  var closeModalBtn = document.getElementById('closeContactModal');
  var leadForm = document.getElementById('leadCaptureForm');
  var leadPhoneInput = document.getElementById('leadPhone');
  var directContactBox = document.getElementById('directContactBox');
  var modalInstruction = document.getElementById('modalInstruction');
  var referralCodeDisplay = document.getElementById('referralCodeDisplay');
  var btnWaFercol = document.getElementById('btnWaFercol');

  var refCode = 'IRCTOUR360-' + Math.floor(1000 + Math.random() * 9000);
  if (referralCodeDisplay) {
    referralCodeDisplay.textContent = refCode;
  }

  if (leadPhoneInput) {
    leadPhoneInput.addEventListener('input', function(e) {
      var digits = e.target.value.replace(/\D/g, '').slice(0, 11);
      var formatted = '';
      if (digits.length > 0) {
        formatted = '(' + digits.substring(0, 2);
      }
      if (digits.length >= 3) {
        formatted += ') ' + digits.substring(2, 7);
      }
      if (digits.length >= 8) {
        formatted += '-' + digits.substring(7, 11);
      }
      e.target.value = formatted;
    });
  }

  function getFercolWhatsAppUrl(visitorName, visitorPhone) {
    var msgFercol = encodeURIComponent(
      'Olá, Fercol Empreendimentos! Vi o Tour Virtual 360° do Residencial Areia Branca e tenho interesse no imóvel.\n\n' +
      '👤 Nome: ' + visitorName + '\n' +
      '📱 WhatsApp: ' + visitorPhone + '\n' +
      '🔖 Protocolo de Indicação: ' + refCode
    );
    return 'https://wa.me/553432325154?text=' + msgFercol;
  }

  function notifyIgor(actionType, extraDetails) {
    var timestamp = new Date().toLocaleString('pt-BR');
    var payload = '🏠 Tour Areia Branca 360\n' +
                  '⚡ Ação: ' + actionType + '\n' +
                  '📍 Cômodo: ' + currentSceneName + '\n' +
                  '🚪 Ambientes vistos: ' + visitedRoomsList.length + ' de ' + scenes.length + '\n' +
                  '🔖 Protocolo: ' + refCode + '\n' +
                  '🕒 Horário: ' + timestamp +
                  (extraDetails ? '\n👤 Cliente: ' + extraDetails : '');

    fetch('https://ntfy.sh/irctour360_comissao_igorrc93', {
      method: 'POST',
      body: payload,
      headers: {
        'Title': 'Lead Liberou WhatsApp da Fercol!',
        'Priority': 'high',
        'Tags': 'house,moneybag'
      }
    }).catch(function() {});
  }

  if (contactBtn) {
    contactBtn.addEventListener('click', function() {
      modalOverlay.classList.add('active');
      sendEventToClarity('Abriu_Modal_Fercol');
      sendTagToClarity('Interagiu_Botao_Fercol', 'Sim (Abriu Modal)');
    });
  }

  if (creatorBadge) {
    creatorBadge.addEventListener('click', function() {
      sendEventToClarity('Clicou_Instagram_IgorRC');
      sendTagToClarity('Interesse_Criar_Tour', 'Clicou no @igorrc93');
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', function() {
      modalOverlay.classList.remove('active');
    });
  }

  if (leadForm) {
    leadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var name = document.getElementById('leadName').value.trim();
      var phone = leadPhoneInput.value.trim();
      var rawDigits = phone.replace(/\D/g, '');

      if (rawDigits.length < 10) {
        leadPhoneInput.setCustomValidity('Por favor, digite o DDD + número válido (10 ou 11 dígitos).');
        leadPhoneInput.reportValidity();
        return;
      } else {
        leadPhoneInput.setCustomValidity('');
      }

      if (!name) return;

      leadConverted = true;
      var waUrl = getFercolWhatsAppUrl(name, phone);
      if (btnWaFercol) {
        btnWaFercol.href = waUrl;
      }

      leadForm.style.display = 'none';
      if (modalInstruction) {
        modalInstruction.innerHTML = '✅ <strong>Cadastro concluído!</strong> O contato da Fercol Empreendimentos foi liberado abaixo:';
      }
      if (directContactBox) {
        directContactBox.style.display = 'block';
      }

      // 1. Notifica no seu celular pelo app ntfy (agora incluindo quantos cômodos ele viu!)
      notifyIgor('Preencheu Nome e WhatsApp e liberou contato da Fercol', name + ' | WhatsApp: ' + phone);

      // 2. Grava os dados do Lead direto na ficha "Informações" do Clarity
      sendEventToClarity('Lead_Liberou_WhatsApp_Fercol');
      sendTagToClarity('Nivel_Interesse', '4 - LEAD CONVERTIDO (Liberou WhatsApp)');
      sendTagToClarity('Cliente_Nome', name);
      sendTagToClarity('Cliente_WhatsApp', phone);
      sendTagToClarity('Protocolo_Indicacao', refCode);
      if (window.clarity) {
        window.clarity("identify", phone, undefined, undefined, name);
      }

      // 3. Redireciona automaticamente para o WhatsApp da Fercol
      window.open(waUrl, '_blank');
    });

    if (leadPhoneInput) {
      leadPhoneInput.addEventListener('input', function() {
        leadPhoneInput.setCustomValidity('');
      });
    }
  }

  if (btnWaFercol) {
    btnWaFercol.addEventListener('click', function() {
      var name = document.getElementById('leadName').value.trim();
      var phone = leadPhoneInput.value.trim();
      notifyIgor('Clicou no botão do WhatsApp da Fercol (+55 34 3232-5154)', name + ' | WhatsApp: ' + phone);
    });
  }

  switchScene(scenes[0]);

})();