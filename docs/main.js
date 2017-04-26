var pages = [
    { 
        url: 'https://www.w3.org/TR/webrtc/', 
        legacyElementId: 'legacy-interface-extensions' 
    },
    { 
        url: 'https://www.w3.org/TR/mediacapture-streams/', 
        legacyElementId: 'navigatorusermedia-interface-extensions' 
    }
];

async function getDocs() {
    var docs = [];
    var parser = new DOMParser();
    var promise = Promise.resolve();
    pages.reduce((promise, page, idx) => {
        promise = promise
            .then(_ => fetch(page.url))
            .then(res => res.text())
            .then(txt => {
                var doc = parser.parseFromString(txt, 'text/html');
                var legacySection = doc.getElementById(page.legacyElementId);
                legacySection.parentElement.removeChild(legacySection);
                docs.push(doc);
                return docs;
            });
    }, promise);
    return promise;
}

function parseAndGenerateCode(docs) {
    var data = WebIDLParse(docs);
    convertToCSData(data);
    generateUnityProxyCode(data, 'UnityWebGLWebRTC');
}

getDocs()
    .then(parseAndGenerateCode)
    .catch(ex => console.log('fetch error', ex));

// fetch('https://www.w3.org/TR/webrtc/')
//     .then(res => res.text())
//     .then(resText => {
//         var domParser = new DOMParser();
//         var doc = domParser.parseFromString(resText, 'text/html');
//         var legacySection = dom.getElementById('legacy-interface-extensions');
//         legacySection.parentElement.removeChild(legacySection);
//         docs.push(doc);
//     })
//     .then(_ => fetch('https://www.w3.org/TR/mediacapture-streams/'))
//     .then(res => res.text())
//     .then(resText => {
//         var domParser = new DOMParser();
//         var dom = domParser.parseFromString(resText, 'text/html');
//         var legacySection = dom.getElementById('navigatorusermedia-interface-extensions');
//         legacySection.parentElement.removeChild(legacySection);
//         docs.push(doc);
//     })
//     .then(parseAndGenerateCode)
//     .catch(ex => console.log('fetch error', ex));
