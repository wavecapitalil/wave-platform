/* Japanica Karmiel location map.
   Coordinates are the OpenStreetMap restaurant node, not a guessed pin.
   Basemap is OpenFreeMap Dark (OpenStreetMap data, no API key). CARTO's
   raster dark_all tiles now require a key and are not used.
   Provenance is registered with WaveSources / WaveDataLog, not printed on this page. */
(function(){
  var LOCATIONS = [{
    id: 'karmiel-maale-kamon-5',
    lat: 32.9275303,
    lng: 35.3260765,
    osm: 'node/13373864335'
  }];
  var STYLE = 'https://tiles.openfreemap.org/styles/dark';
  var map = null;
  var markers = [];

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function label(key, fallback){
    return typeof t === 'function' ? t(key, fallback) : fallback;
  }
  function popupHtml(){
    return '<strong>' + esc(label('japanica.name', 'Japanica')) + '</strong><br>'
      + esc(label('japanica.street', "Ma'ale Kamon 5")) + '<br>'
      + esc(label('japanica.city', 'Karmiel, Israel'));
  }
  function refreshPopups(){
    markers.forEach(function(marker){
      var popup = marker.getPopup && marker.getPopup();
      if(popup) popup.setHTML(popupHtml());
    });
    var mapEl = document.getElementById('japanicaMap');
    if(mapEl) mapEl.setAttribute('aria-label', label('japanica.mapLabel', 'Map of Japanica in Karmiel'));
  }
  function recordSources(){
    if(!window.WaveSources) return;
    var loc = LOCATIONS[0];
    WaveSources.record(
      'place:japanika-karmiel',
      'Japanica · Karmiel',
      [
        'Coordinates (latitude, longitude): ' + loc.lat + ', ' + loc.lng + '. OpenStreetMap ' + loc.osm + ' (amenity=restaurant).',
        'One Karmiel branch confirmed.',
        'Name: Japanika (ג׳פניקה).',
        "Street: Ma'ale Kamon 5 (מעלה כמון 5).",
        'City: Karmiel, Israel (כרמיאל). Suburb on the OSM address: Karmiel Industrial Zone.',
        'Postal code on the OSM address: 2195106.',
        'Nominatim search "Japanika Karmiel" returned this node. A bounded search across Karmiel returned the same single node and no second branch.',
        "The same street address is listed by Wolt (מעלה כמון 5, כרמיאל) and Rest.co.il. The chain's Karmiel branch page on japanika.net did not load during this check, so it was not used as a confirming source.",
        'Basemap: OpenFreeMap Dark style (OpenStreetMap data via OpenMapTiles). No API key. CARTO raster dark_all is not used because those tiles now require a key. MapLibre shows the OpenFreeMap, OpenMapTiles and OpenStreetMap attribution on the map.'
      ].join('\n'),
      [
        {title:'OpenStreetMap node 13373864335', url:'https://www.openstreetmap.org/node/13373864335'},
        {title:'Nominatim — Japanika Karmiel', url:'https://nominatim.openstreetmap.org/search?q=Japanika%20Karmiel&format=jsonv2&addressdetails=1'},
        {title:'Wolt — Japanika Karmiel', url:'https://wolt.com/en/isr/karmiel-area/restaurant/japanika-karmiel'},
        {title:'Rest.co.il — Japanika Karmiel', url:'https://www.rest.co.il/rest/80293142/'},
        {title:'OpenFreeMap', url:'https://openfreemap.org/'}
      ]
    );
  }
  function showFallback(){
    var el = document.getElementById('japanicaMap');
    if(!el || el.querySelector('.maplibregl-canvas') || el.querySelector('.japanica-map-fallback')) return;
    el.innerHTML = '<div class="japanica-map-fallback" data-i18n="japanica.mapUnavailable">'
      + esc(label('japanica.mapUnavailable', 'Map unavailable')) + '</div>';
  }
  function ensureRtl(){
    if(!window.maplibregl || typeof maplibregl.setRTLTextPlugin !== 'function') return;
    var status = typeof maplibregl.getRTLTextPluginStatus === 'function' ? maplibregl.getRTLTextPluginStatus() : 'unavailable';
    if(status !== 'unavailable') return;
    maplibregl.setRTLTextPlugin('https://cdn.jsdelivr.net/npm/@mapbox/mapbox-gl-rtl-text@0.2.3/mapbox-gl-rtl-text.js', true);
  }
  function ensureMap(){
    var el = document.getElementById('japanicaMap');
    if(!el) return;
    if(!window.maplibregl){ showFallback(); return; }
    if(map){ refreshPopups(); return; }
    ensureRtl();
    var center = LOCATIONS[0];
    try {
      map = new maplibregl.Map({
        container: el,
        style: STYLE,
        center: [center.lng, center.lat],
        zoom: LOCATIONS.length > 1 ? 13 : 16,
        attributionControl: true,
        fadeDuration: 0
      });
    } catch (err) {
      map = null;
      showFallback();
      return;
    }
    map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
    map.on('load', function(){
      LOCATIONS.forEach(function(loc){
        var marker = new maplibregl.Marker({color:'#4a9eff'})
          .setLngLat([loc.lng, loc.lat])
          .setPopup(new maplibregl.Popup({offset:28, closeButton:true}).setHTML(popupHtml()))
          .addTo(map);
        markers.push(marker);
      });
      if(LOCATIONS.length > 1){
        var bounds = new maplibregl.LngLatBounds();
        LOCATIONS.forEach(function(loc){ bounds.extend([loc.lng, loc.lat]); });
        map.fitBounds(bounds, {padding:28, maxZoom:16});
      }
      refreshPopups();
    });
  }
  function openJapanicaMap(){
    ensureMap();
    if(!map) return;
    setTimeout(function(){ map.resize(); }, 60);
  }
  window.openJapanicaMap = openJapanicaMap;

  recordSources();

  var previousLang = window.onLangChange;
  window.onLangChange = function(lang){
    if(typeof previousLang === 'function') previousLang(lang);
    refreshPopups();
  };
})();
