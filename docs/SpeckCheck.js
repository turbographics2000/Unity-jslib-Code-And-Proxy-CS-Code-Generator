function WebRTCSpecCoverageCheck(classStructs) {
    var fragment = document.createDocumentFragment();
    var browsers = ['Chrome', 'Edge', 'Firefox', 'Safari'];
    // Opera 8.0+
    var isOpera = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isSafari = /constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || safari.pushNotification);
    var isIE = /*@cc_on!@*/false || !!document.documentMode;
    var isEdge = !isIE && !!window.StyleMedia;
    var isChrome = !!window.chrome && !!window.chrome.webstore;
    var isBlink = (isChrome || isOpera) && !!window.CSS;
    Object.keys(classStructs.interface).forEach(id => {
        if (window[id]) {
            let rtcObj = classStructs.interface[id];
            let secId = document.createElement('section');
            let h2 = document.createElement('h2');
            h2.textContent = id;
            h2.classList.add('OK');
            secId.appendChild(h2);
            fragment.appendChild(secId);
            if (rtcObj.members) {
                rtcObj.members.forEach(member => {
                    var div = document.createElement('div');
                    div.textContent = member.name;
                    if (Object.keys(window[id].prototype).includes(member.name)) {
                        div.classList.add('OK');
                    } else {
                        div.classList.add('NG');
                    }
                    secId.appendChild(div);
                });
            }
            if (rtcObj.methods) {
                rtcObj.methods.forEach(method => {
                    var div = document.createElement('div');
                    div.textContent = method.name;
                    if (Object.keys(window[id].prototype).includes(method.name)) {
                        div.classList.add('OK');
                    } else {
                        div.classList.add('NG');
                    }
                    secId.appendChild(div);
                });
                fragment.appendChild(secId);
            }
        } else {
            let rtcObj = classStructs[type][id];
            let secId = document.createElement('section');
            let h2 = document.createElement('h2');
            h2.textContent = id;
            h2.classList.add('NG');
            secId.appendChild(h2);
            fragment.appendChild(secId);
        }
    });
    document.body.appendChild(fragment);
}