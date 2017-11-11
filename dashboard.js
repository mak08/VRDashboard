// UI Controller

var controller = function () {

    // Earth radius in meters
    var radius =  6371229.0;
    // Nautical mile in meters
    var nauticalmile = 1852.0;

    var selRace;
    var lbCurTime, lbCurPos, lbHeading, lbTWS, lbTWD, lbTWA, lbPrevPos, lbDeltaD, lbDeltaT, lbSpeedC, lbSpeedR;
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
        + "<th>" + "vL (kts)" + "</th>"
        + "<th>" + "vC (kts)" + "</th>"
        + "<th>" + "Δd (nm)" + "</th>"
        + "<th>" + "Δt (sec)" + "</th>"
        + "<th>" + "AutoSail" + "</th>"
        + "<th>" + "AutoTWA" + "</th>"
        + "<th>" + "Sail chng" + "</th>"
        + "<th>" + "Gybing" + "</th>"
        + "<th>" + "Tacking" + "</th>"
        +  "</tr>";

    var raceMap = new Map();
    var selectedRace;

    function Race (raceId, raceName) {

        this.raceId = raceId;
        this.raceName = raceName;

        // Frame payload as received. Used for calculations.
        var curr, prev

        // Array of old messages (including previous and current),
        // processed and converted to HTML table rows
        var tableLines = [];

        // Raw messages
        var rawLog = ""; 

        function makeTableHTML () {
            return "<table style=\"width:100%\">"
                + tableHeader
                + tableLines.join(' ')
                + "</table>";
        }

        function makeTableLine () {
            var now = new Date();
            
            var autoSail = curr.tsEndOfAutoSail - now;
            if ( autoSail < 0 ) {
                autoSail = '-';
            } else {
                autoSail = new Date(autoSail).toJSON().substring(11,19);
            }

            var sailChange = formatSeconds(curr.tsEndOfSailChange - now);
            var gybing = formatSeconds(curr.tsEndOfGybe - now);
            var tacking = formatSeconds(curr.tsEndOfTack - now);
            
            var deltaD = (gcDistance(prev.pos.lat, prev.pos.lon, curr.pos.lat, curr.pos.lon) / nauticalmile);
            // Epoch timestamps are milliseconds since 00:00:00 UTC on 1 January 1970.
            var deltaT = (curr.lastCalcDate - prev.lastCalcDate)/1000;
            var sDeltaD = roundTo(deltaD, 2);
            var sDeltaT = roundTo(deltaT, 0);
            var sSpeedC = roundTo(deltaD/deltaT * 3600, 2);
            return "<tr>"
                + "<td>" + new Date(curr.lastCalcDate).toGMTString() + "</td>"
                + "<td>" + formatPosition(curr.pos.lat, curr.pos.lon) + "</td>"
                + "<td>" + roundTo(curr.heading, 1) + "</td>"
                + "<td>" + roundTo(curr.tws, 1) + "</td>"
                + "<td>" + roundTo(curr.twd, 1) + "</td>"
                + "<td>" + roundTo(curr.twa, 1) + "</td>"
                + "<td>" + roundTo(curr.speed, 2) + "</td>"
                + "<td>" + roundTo(deltaD/deltaT * 3600, 2) + "</td>"
                + "<td>" + "?" + "</td>"
                + "<td>" + sDeltaD + "</td>"
                + "<td>" + sDeltaT + "</td>"
                + "<td>" + autoSail + "</td>"
                + "<td>" + roundTo(curr.twaAuto, 1) + "</td>"
                + "<td>" + sailChange + "</td>"
                + "<td>" + gybing + "</td>"
                + "<td>" + tacking + "</td>"
                + "</tr>";
        }
        
        function saveMessage () {
            var newRow = makeTableLine();
            tableLines.reverse().push(newRow);
            tableLines = tableLines.reverse();
            divRecordLog.innerHTML = makeTableHTML();
        }
        
        this.updateRace = function (message) {
            prev = curr;
            curr = message;
            var timeStamp = new Date(curr.lastCalcDate);
            lbCurTime.innerHTML = ' ' + timeStamp.toGMTString();
            lbCurPos.innerHTML = ' ' + formatPosition(curr.pos.lat, curr.pos.lon);
            lbHeading.innerHTML = ' ' + roundTo(curr.heading, 1);
            lbTWS.innerHTML = ' ' + roundTo(curr.tws, 1);
            lbTWD.innerHTML = ' ' + roundTo(curr.twd, 1);
            lbTWA.innerHTML = ' ' + roundTo(curr.twa, 1);
            lbSpeedR.innerHTML = ' ' + roundTo(curr.speed, 2);
            if ( prev != undefined ) {
                saveMessage();
                var deltaD = (gcDistance(prev.pos.lat, prev.pos.lon, curr.pos.lat, curr.pos.lon) / nauticalmile);
                // Epoch timestamps are milliseconds since 00:00:00 UTC on 1 January 1970.
                var deltaT = (curr.lastCalcDate - prev.lastCalcDate)/1000;
                lbDeltaD.innerHTML = ' ' + roundTo(deltaD, 2) + 'nm' + ' ';
                lbDeltaT.innerHTML = ' ' + roundTo(deltaT, 0) + 's' + ' ';
                lbSpeedC.innerHTML = ' ' + roundTo(deltaD/deltaT * 3600, 2) + 'kts' + ' ';
            }
        }
    }
    
    function formatSeconds (value) {
        if ( value < 0 ) {
            return "-";
        } else {
            return roundTo(value/1000, 0);
        }
    }
    
    function callUrlZezo () {
        var baseURL = 'http://zezo.org';
        var url = baseURL + '/' + selRace.value + '/chart.pl?lat=' + curr.pos.lat + '&lon=' + curr.pos.lon;
        window.open(url, '_blank');
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
        divPositionInfo = document.getElementById("position_info");
        divRecordLog = document.getElementById("recordlog");
        divRawLog = document.getElementById("rawlog");
        callUrlFunction = callUrlZezo;
        initialized = true;
    }

    var function onSelectRace () {
        selectedRace = selRace.value;
        alert('race selected');
    }

    var callUrl = function () {
        if ( selectedRace === undefined ) {
            alert('No race selected.');
        } else if ( selectedRace.curr === undefined ) {
            alert('No position received for ' + selectedRace.raceName + 'yet. Please retry later.');
        } else if ( callUrlFunction === undefined ) {
            alert('internal error');
        } else {
            callUrlFunction();
        }
    }

    var onEvent = function (debuggeeId, message, params) {
        if ( tabId != debuggeeId.tabId )
            return;

        if ( message == "Network.webSocketFrameReceived" ) {

            // Append message to raw log
            divRawLog.innerHTML = divRawLog.innerHTML + '\n' + params.response.payloadData;

            // Check if we got a position report & update lat/lon
            // Oppenent's info is in different message type (using scriptData.legInfos)
            var frameData = JSON.parse(params.response.payloadData);

            if ( frameData != undefined
                 && frameData.scriptData != undefined
                 && frameData.scriptData.boatState != undefined ) {
                var message = frameData.scriptData;
                // Initial status message for race
                if ( message.leg === undefined
                     || message.leg._id === undefined
                     || message.leg._id.race_id != message.boatState._id.race_id
                     || message.leg.race === undefined ) {
                    alert('Unexpected format of inital race message');
                } else {
                    var race = raceMap.get(message.boatState._id.race_id);
                    if ( race === undefined ) {
                        race = new Race(message.boatState._id.race_id,
                                        message.leg.race.name);
                        raceMap.set(message.boatState._id.race_id, race);
                        var option = document.createElement("option");
                        option.text = message.leg.race.name;
                        option.value = message.leg._id.race_id;
                        selRace.add(option);
                    }
                    race.updateRace(message.boatState);
                }
            } else if ( frameData != undefined
                        && frameData.data != undefined
                        && frameData.data.pos != undefined ) {
                var race = raceMap.get(frameData.data._id.race_id);
                if ( race != null ) {
                    race.updateRace(frameData.data);
                } else {
                    console.log("Ignoring boatStatePush for unknown race "  +  frameData.data._id.race_id);
                }
            }
        }
    }

    return {
        // The only point of initialize is to wait until the document is constructed.
        initialize: initialize,
        // Useful functions
        onSelectRace: onSelectRace,
        callUrl: callUrl,
        onEvent: onEvent
    }
} ();


var tabId = parseInt(window.location.search.substring(1));

window.addEventListener("load", function() {

    controller.initialize();
    
    document.getElementById("bt_callurl").addEventListener("click", controller.callUrl);
    document.getElementById("sel_race").addEventListener("onchange", controller.onSelectRace);
    
    chrome.debugger.sendCommand({tabId:tabId}, "Network.enable");
    chrome.debugger.onEvent.addListener(controller.onEvent);
});

window.addEventListener("unload", function() {
    chrome.debugger.detach({tabId:tabId});
});

