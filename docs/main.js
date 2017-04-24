fetch('https://www.w3.org/TR/webrtc/')
    .then(res => res.text())
    .then(resText => {
        var domParser = new DOMParser();
        var dom = domParser.parseFromString(resText, 'text/html');
        var legacySection = dom.getElementById('legacy-interface-extensions');
        legacySection.parentElement.removeChild(legacySection);
        var data = WebIDLParse(dom, false);
        convertToCSData(data);
        // console.clear();
        // console.log(JSON.stringify(data, null, 4));
        generateCS(data, 'WebRTCGenerateCS');
    })
    .then(_ => fetch('https://www.w3.org/TR/mediacapture-streams/'))
    .then(res => res.text())
    .then(resText => {
        var domParser = new DOMParser();
        var dom = domParser.parseFromString(resText, 'text/html');
        var legacySection = dom.getElementById('navigatorusermedia-interface-extensions');
        legacySection.parentElement.removeChild(legacySection);
        var data = WebIDLParse(dom, false);
        convertToCSData(data);
        // console.clear();
        // console.log(JSON.stringify(data, null, 4));
        generateCS(data, 'MediaCaptureGenerateCS');
    })
    .catch(ex => console.log('fetch error', ex));
