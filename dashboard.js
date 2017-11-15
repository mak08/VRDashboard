// UI Controller


var controller = function () {
    
    // Polars and other game parameters, indexed by polar._id
    var polars =  [];

    var races = [];

    function initRaces() {
        var xhr = new XMLHttpRequest();
        xhr.onload = function() {
            var json = xhr.responseText;
            json = JSON.parse(json);
            for (var i = 0; i < json.races.length; i++) {
                var race = json.races[i];
                races[race.id] = race;
                races[race.id].tableLines=[];
                var option = document.createElement("option");
                option.text =race.name;
                option.value = race.id;
                option.betaflag = false;
                sel_race.appendChild(option);
                    if (race.has_beta) {
                    var optionb = document.createElement("option");
                    optionb.text = race.name + " beta"
                    optionb.value = race.id;
                    optionb.betaflag = true;
                    sel_race.appendChild(optionb);
                }
            }
        }
        xhr.open('GET', 'http://zezo.org/races.json');
        xhr.send();
    }

    // Earth radius in meters
    var radius =  6371229.0;
    // Nautical mile in meters
    var nauticalmile = 1852.0;

    var selRace, cbRouter, cbReuseTab;
    var lbRace, lbCurTime, lbCurPos, lbHeading, lbTWS, lbTWD, lbTWA, lbPrevPos, lbDeltaD, lbDeltaT, lbSpeedC, lbSpeedR, lbSpeedT;
    var divPositionInfo, divRecordLog, divRawLog;
    var callUrlFunction;
    var initialized = false;

    var tableHeader =   "<tr>"
        + "<th>" + "Time" + "</th>"
        + "<th>" + "Position" + "</th>"
        + "<th>" + "Heading" + "</th>"
        + "<th>" + "TWS" + "</th>"
        + "<th>" + "TWD" + "</th>"
        + "<th>" + "TWA" + "</th>"
        + "<th>" + "vR (kts)" + "</th>"
        + "<th>" + "vC (kts)" + "</th>"
        + "<th>" + "vT (kts)" + "</th>"
        + "<th>" + "Δd (nm)" + "</th>"
        + "<th>" + "Δt (sec)" + "</th>"
        + "<th>" + "AutoSail" + "</th>"
        + "<th>" + "AutoTWA" + "</th>"
        + "<th>" + "Sail chng" + "</th>"
        + "<th>" + "Gybing" + "</th>"
        + "<th>" + "Tacking" + "</th>"
        +  "</tr>";


    function makeTableHTML (r) {
        return "<table style=\"width:100%\">"
            + tableHeader
            + (r === undefined?"":r.tableLines.join(' '))
            + "</table>";
    }

    function formatSeconds (value) {
        if ( value < 0 ) {
            return "-";
        } else {
            return roundTo(value/1000, 0);
        }
    }
    
    function makeTableLine (r) {

        var autoSail = r.curr.tsEndOfAutoSail - r.curr.lastCalcDate;
        if ( autoSail < 0 ) {
            autoSail = '-';
        } else {
            autoSail = new Date(autoSail).toJSON().substring(11,19);
        }

        var sailChange = formatSeconds(r.curr.tsEndOfSailChange - r.curr.lastCalcDate);
        var gybing = formatSeconds(r.curr.tsEndOfGybe - r.curr.lastCalcDate);
        var tacking = formatSeconds(r.curr.tsEndOfTack - r.curr.lastCalcDate);

        return "<tr>"
            + "<td>" + new Date(r.curr.lastCalcDate).toGMTString() + "</td>"
            + "<td>" + formatPosition(r.curr.pos.lat, r.curr.pos.lon) + "</td>"
            + "<td>" + roundTo(r.curr.heading, 1) + "</td>"
            + "<td>" + roundTo(r.curr.tws, 1) + "</td>"
            + "<td>" + roundTo(r.curr.twd, 1) + "</td>"
            + "<td>" + roundTo(r.curr.twa, 1) + "</td>"
            + "<td>" + roundTo(r.curr.speed, 2) + "</td>"
            + "<td>" + roundTo(r.curr.speedC, 2) + "</td>"
            + "<td>" + r.curr.speedT + "</td>"
            + "<td>" + roundTo(r.curr.deltaD, 2) + "</td>"
            + "<td>" + roundTo(r.curr.deltaT, 0) + "</td>"
            + "<td>" + autoSail + "</td>"
            + "<td>" + roundTo(r.curr.twaAuto, 1) + "</td>"
            + "<td>" + sailChange + "</td>"
            + "<td>" + gybing + "</td>"
            + "<td>" + tacking + "</td>"
            + "</tr>";
    }

    function saveMessage (r) {
        var newRow = makeTableLine(r);
        r.tableLines.unshift(newRow);
        if (r.id == selRace.value) {
            divRecordLog.innerHTML = makeTableHTML(r);
        }
    }

    function changeRace() {
        divRecordLog.innerHTML = makeTableHTML(races[this.value]);
    }
    
    function updatePosition (message, r) {
        "use strict";
        if (r.curr !== undefined && r.curr.lastCalcDate == message.lastCalcDate) { // repeated message
            return;
        }
        r.prev = r.curr;
        r.curr = message;
        var timeStamp = new Date(r.curr.lastCalcDate);
        lbRace.innerHTML = ' ' + r.name;
        lbCurTime.innerHTML = ' ' + timeStamp.toGMTString();
        lbCurPos.innerHTML = ' ' + formatPosition(r.curr.pos.lat, r.curr.pos.lon);
        lbHeading.innerHTML = ' ' + roundTo(r.curr.heading, 1);
        lbTWS.innerHTML = ' ' + roundTo(r.curr.tws, 1);
        lbTWD.innerHTML = ' ' + roundTo(r.curr.twd, 1);
        lbTWA.innerHTML = ' ' + roundTo(r.curr.twa, 1);
        lbSpeedR.innerHTML = ' ' + roundTo(r.curr.speed, 2);
        r.curr.speedT =  theoreticalSpeed(message);
        lbSpeedT.innerHTML = r.curr.speedT;
        if ( r.prev != undefined ) {
            r.curr.deltaD = (gcDistance(r.prev.pos.lat, r.prev.pos.lon, r.curr.pos.lat, r.curr.pos.lon) / nauticalmile);
            // Epoch timestamps are milliseconds since 00:00:00 UTC on 1 January 1970.
            r.curr.deltaT = (r.curr.lastCalcDate - r.prev.lastCalcDate)/1000;
            r.curr.speedC = roundTo(r.curr.deltaD/r.curr.deltaT * 3600, 2);
            lbDeltaD.innerHTML = ' ' + roundTo(r.curr.deltaD, 2) + 'nm' + ' ';
            lbDeltaT.innerHTML = ' ' + roundTo(r.curr.deltaT, 0) + 's' + ' ';
            lbSpeedC.innerHTML = ' ' + r.curr.speedC + 'kts' + ' ';
            saveMessage(r);
        }
    }

    function theoreticalSpeed (message) {
        var boatPolars = polars[message.boat.polar_id];
        if ( boatPolars === undefined || boatPolars === null ) {
            return '-';
        } else {
            var tws = message.tws;
            var twd = message.twd;
            var twa = message.twa;
            var options = message.options;
            var foil = foilingFactor(options, tws, twa, boatPolars.foil);
            var hull = options.includes("hull")?1.003:1.0;
            var twsLookup = fractionStep(tws, boatPolars.tws);
            var twaLookup = fractionStep(twa, boatPolars.twa);
            var speed = maxSpeed(options, twsLookup, twaLookup, boatPolars.sail);
            return ' ' + roundTo(speed.speed * foil * hull, 2) + '(' + speed.sail + ')';
        }
    }

    function maxSpeed (options, iS, iA, sailDefs) {
        var maxSpeed = 0;
        var maxSail = "";
        for (const sailDef of sailDefs) {
            if ( sailDef.name === "JIB"
                 || sailDef.name === "SPI"
                 || (sailDef.name === "STAYSAIL" && options.includes("heavy"))
                 || (sailDef.name === "LIGHT_JIB" && options.includes("light"))
                 || (sailDef.name === "CODE_0" && options.includes("reach"))
                 || (sailDef.name === "HEAVY_GNK" && options.includes("heavy"))
                 || (sailDef.name === "LIGHT_GNK" && options.includes("light")) ) {
                var speeds = sailDef.speed;
                var speed = bilinear(iA.fraction, iS.fraction,
                                     speeds[iA.index - 1][iS.index - 1],
                                     speeds[iA.index][iS.index - 1],
                                     speeds[iA.index - 1][iS.index],
                                     speeds[iA.index][iS.index]);
                if ( speed > maxSpeed ) {
                    maxSpeed = speed;
                    maxSail = sailDef.name;
                }
            }
        }
        return {
            speed: maxSpeed,
            sail: maxSail
        }
    }

    function bilinear (x, y, f00, f10, f01, f11) {
        return f00 * (1 - x) * (1 - y)
            + f10 * x * (1 - y)
            + f01 * (1 - x) * y
            + f11 * x * y;
    }

    function foilingFactor (options, tws, twa, foil) {
        var absTWA = Math.abs(twa);
        if ( options.includes("foil")
             && tws >= foil.twsMin - foil.twsMerge
             && tws <= foil.twsMax + foil.twsMerge
             && absTWA >= foil.twaMin - foil.twaMerge
             && absTWA <= foil.twaMax + foil.twaMerge ) {
            if ( tws >= foil.twsMin
                 && tws <= foil.twsMax
                 && absTWA >= foil.twaMin
                 && absTWA <= foil.twaMax ) {
                return foil.speedRatio;
            } else {
                return 1.0 + (foil.speedRatio - 1.0) / 2.0;
            }
        } else {
            return 1.0;
        }
    }
            
    function fractionStep (value, steps) {
        var absVal = Math.abs(value);
        var index = 0;
        while ( index < steps.length && steps[index]<= absVal ) {
            index++;
        }
        return {
            index: index,
            fraction: (absVal - steps[index-1]) / (steps[index] - steps[index-1])
        }
    }
    
    function callUrlZezo (raceId, beta) {
        var baseURL = 'http://zezo.org';
        var r = races[raceId];
        var urlBeta = r.url + (beta?"b":"");

        var url = baseURL + '/' + urlBeta + '/chart.pl?lat=' + r.curr.pos.lat + '&lon=' + r.curr.pos.lon;
        window.open(url, cbReuseTab.checked?urlBeta:'_blank');
    }
    
    // Greate circle distance in meters
    function gcDistance (lat0, lon0, lat1, lon1) {
        // e = r · arccos(sin(φA) · sin(φB) + cos(φA) · cos(φB) · cos(λB – λA))
        var rlat0 = toRad(lat0);
        var rlat1 = toRad(lat1);
        var rlon0 = toRad(lon0);
        var rlon1 = toRad(lon1);
        return radius * Math.acos(Math.sin(rlat0) * Math.sin(rlat1)
                                  + Math.cos(rlat0) * Math.cos(rlat1) * Math.cos(rlon1 - rlon0));
    }

    function toRad (angle) {
        return angle / 180 * Math.PI;
    }
    
    function toDeg (number) {
        var u = sign(number);
        number = Math.abs(number);
        var g = Math.floor(number);
        var frac = number - g;
        var m = Math.floor(frac * 60);
        frac = frac - m/60;
        var s = Math.floor(frac * 3600);
        var cs = roundTo(360000 * (frac - s/3600), 0);
        while ( cs >= 100 ) {
            cs = cs - 100;
            s = s + 1;
        }
        return {"u":u, "g":g, "m":m, "s":s, "cs":cs};
    }
    
    function roundTo (number, digits) {
        var scale = Math.pow(10, digits);
        return Math.round(number * scale) / scale;
    }

    function sign (x) {
        return (x < 0)? -1: 1;
    }

    function formatPosition (lat, lon) {
        var latDMS = toDeg(lat);
        var lonDMS = toDeg(lon);
        var latString = latDMS.g + "°" + latDMS.m + "'" + latDMS.s + "\"";
        var lonString = lonDMS.g + "°" + lonDMS.m + "'" + lonDMS.s + "\"";
        return ((lonDMS.u==1)?' E ':' W ') + lonString + ' ' + ((latDMS.u==1)?' N ':' S ') + latString;
    }

    var initialize = function () {
        var manifest = chrome.runtime.getManifest();
        document.getElementById("lb_version").innerHTML = manifest.version;
       
        selRace = document.getElementById("sel_race");
        cbRouter = document.getElementById("auto_router");
        cbReuseTab = document.getElementById("reuse_tab");
        lbRace = document.getElementById("lb_race");
        lbCurTime = document.getElementById("lb_curtime");
        lbCurPos = document.getElementById("lb_curpos");
        lbHeading = document.getElementById("lb_heading");
        lbTWS = document.getElementById("lb_tws");
        lbTWD = document.getElementById("lb_twd");
        lbTWA = document.getElementById("lb_twa");
        lbDeltaD = document.getElementById("lb_delta_d");
        lbDeltaT = document.getElementById("lb_delta_t");
        lbSpeedC = document.getElementById("lb_curspeed_computed");
        lbSpeedR = document.getElementById("lb_curspeed_reported");
        lbSpeedT = document.getElementById("lb_curspeed_theoretical");
        divPositionInfo = document.getElementById("position_info");
        divRecordLog = document.getElementById("recordlog");
        divRecordLog.innerHTML = makeTableHTML();
        divRawLog = document.getElementById("rawlog");
        callUrlFunction = callUrlZezo;
        initRaces();
        chrome.storage.local.get("polars", function(items) {
            console.log("Retrieved " + items["polars"].filter(function(value) { return value !== null }).length + " polars."); 
            polars = items["polars"];
        });
        initialized = true;
    }
    
    var callUrl = function (raceId) {
        var beta = false;

        if (typeof raceId === "object") { // button event
            raceId = selRace.value;
            beta = selRace.options[selRace.selectedIndex].betaflag;
        }
        if ( races[raceId].curr === undefined ) {
            alert('No position received yet. Please retry later.');
        } else if ( callUrlFunction === undefined ) {
            // ?
        } else {
            callUrlFunction(raceId, beta);
        }
    }

    var onEvent = function (debuggeeId, message, params) {
        if ( tabId != debuggeeId.tabId )
            return;

        if ( message == "Network.webSocketFrameReceived" ) {

            // Append message to raw log
            // divRawLog.innerHTML = divRawLog.innerHTML + '\n' + params.response.payloadData;
            
            // Dispatch on type of message (determined by which fields we find..)
            // Oppenent's info is in different message type (using scriptData.legInfos)
            var frameData = JSON.parse(params.response.payloadData);

            if ( frameData != undefined ) {

                if ( frameData.scriptData != undefined ) {
                    var message = frameData.scriptData;
                    if ( message.boatState != undefined ) {
                        // Initial boatstate message.
                        var raceId = message.boatState._id.race_id;
                        updatePosition(message.boatState, races[raceId]);
                        if (cbRouter.checked) {
                            callUrl(raceId);
                        }
                    } else if ( message.polar != undefined ) {
                        if ( polars[message.polar._id] === undefined ) {
                            polars[message.polar._id] = message.polar;
                            chrome.storage.local.set({"polars": polars});
                            console.log("Stored "+ polars.filter(function(value) { return value !== undefined }).length + " polars.");
                        }
                    }
                } else if ( frameData != undefined
                            && frameData.data != undefined
                            && frameData.data.pos != undefined ) {
                    updatePosition(frameData.data, races[frameData.data._id.race_id]);
                }
            }
        }
    }

    return {
        // The only point of initialize is to wait until the document is constructed.
        initialize: initialize,
        // Useful functions
        callUrl: callUrl,
        changeRace: changeRace,
        onEvent: onEvent
    }
} ();


var tabId = parseInt(window.location.search.substring(1));


window.addEventListener("load", function() {

    controller.initialize();
    
    document.getElementById("bt_callurl").addEventListener("click", controller.callUrl);
    document.getElementById("sel_race").addEventListener("change", controller.changeRace);
    
    chrome.debugger.sendCommand({tabId:tabId}, "Network.enable");
    chrome.debugger.onEvent.addListener(controller.onEvent);
});

window.addEventListener("unload", function() {
    chrome.debugger.detach({tabId:tabId});
});
