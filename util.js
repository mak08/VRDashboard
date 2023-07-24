// Earth radius in nm, 360*60/(2*Pi);
var radius = 3437.74683;

function addDistance (pos, distnm, angle, radiusnm=radius) {
    var posR = {};
    posR.lat = toRad(pos.lat);
    posR.lon = toRad(pos.lon);
    var d = distnm / radiusnm;
    var angleR = toRad(angle);
    var dLatR = d * Math.cos(angleR);
    var dLonR = d * (Math.sin(angleR) / Math.cos(posR.lat + dLatR));
    return { "lat": toDeg(posR.lat + dLatR),
             "lon": toDeg(posR.lon + dLonR) };
}

function angle(h0, h1) {
    return Math.abs(Math.PI - Math.abs(h1 - h0));
}

function courseAngle(lat0, lon0, lat1, lon1) {
    var rlat0 = toRad(lat0);
    var rlat1 = toRad(lat1);
    var rlon0 = toRad(lon0);
    var rlon1 = toRad(lon1);
    var xi = gcAngle(rlat0, rlon0, rlat1, rlon1);
    var a = Math.acos((Math.sin(rlat1) - Math.sin(rlat0) * Math.cos(xi)) / (Math.cos(rlat0) * Math.sin(xi)));
    return (Math.sin(rlon1 - rlon0) > 0) ? a : (2 * Math.PI - a);
}

function formatDDMMYY (d) {
    var s = ""
        + pad0(d.getUTCDate())
        + pad0(d.getUTCMonth() + 1)
        + d.getUTCFullYear().toString().substring(2,4);
    return s;
}

function formatDHMS (seconds) {
    if (seconds === undefined || isNaN(seconds) || seconds < 0) {
        return "-";
    }
    
    seconds = Math.floor(seconds / 1000);
    
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor(seconds / 3600) % 24;
    var minutes = Math.floor(seconds / 60) % 60;
    
    return pad0(days) + "d" + pad0(hours) + "h" + pad0(minutes) + "m"; // + seconds + "s";
}

function formatHHMMSSSS(d) {
    var s = ""
        + pad0(d.getUTCHours())
        + pad0(d.getUTCMinutes())
        + pad0(d.getUTCSeconds())
        + "."
        + pad0(d.getUTCMilliseconds(), 3);
    return s;
}

function formatHMS (seconds) {
    if (seconds === undefined || isNaN(seconds) || seconds < 0) {
        return "-";
    }
    
    seconds = Math.floor(seconds / 1000);
    
    var hours = Math.floor(seconds / 3600);
    seconds -= 3600 * hours;
    
    var minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    
    return pad0(hours) + "h" + pad0(minutes) + "m"; // + seconds + "s";
}

function formatMS(seconds) {
    if (seconds === undefined || isNaN(seconds) || seconds < 0) {
        return "-";
    }
    
    seconds = Math.floor(seconds / 1000);
    
    var minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    
    return pad0(minutes) + "m" + pad0(seconds) + "s";
}

function formatPosition(lat, lon) {
    var latDMS = toDMS(lat);
    var lonDMS = toDMS(lon);
    var latString = latDMS.g + "°" + pad0(latDMS.m) + "'" + pad0(latDMS.s) + "." + pad0(latDMS.cs, 2) + '"';
    var lonString = lonDMS.g + "°" + pad0(lonDMS.m) + "'" + pad0(lonDMS.s) + "." + pad0(lonDMS.cs, 2) + '"';
    return latString + ((latDMS.u == 1) ? "N" : "S") + " " + lonString + ((lonDMS.u == 1) ? "E" : "W");
}

function gcAngle(rlat0, rlon0, rlat1, rlon1) {
    return Math.acos(Math.sin(rlat0) * Math.sin(rlat1) + Math.cos(rlat0) * Math.cos(rlat1) * Math.cos(rlon1 - rlon0));
}

// Greate circle distance
function gcDistance(pos0, pos1) {
    // e = r · arccos(sin(φA) · sin(φB) + cos(φA) · cos(φB) · cos(λB – λA))
    var rlat0 = toRad(pos0.lat);
    var rlat1 = toRad(pos1.lat);
    var rlon0 = toRad(pos0.lon);
    var rlon1 = toRad(pos1.lon);
    return radius * gcAngle(rlat0, rlon0, rlat1, rlon1);
}

function intersectionPoint (p, q, m, r) {
    // Compute the intersection points of a line (p, q) and a circle (m, r)

    // Center on circle
    var s = {}; s.x = p.lat - m.lat; s.y = p.lon - m.lon;
    var t = {}; t.x = q.lat - m.lat; t.y = q.lon - m.lon;

    // Aux variables
    var d = {}; d.x = t.x - s.x; d.y = t.y - s.y;

    var dr2 = d.x * d.x + d.y * d.y;
    var D =  s.x * t.y - t.x * s.y;
    var D2 = D * D;

    // Check if line intersects at all
    var discr = r * r * dr2 - D2;
    if (discr < 0) {
        return null;
    }

    // Compute intersection point of (infinite) line and circle
    var R = Math.sqrt( r * r * dr2 - D2);

    var x1 = (D*d.y + Util.sign(d.y) * d.x * R)/dr2;
    var x2 = (D*d.y - Util.sign(d.y) * d.x * R)/dr2;

    var y1 = (-D*d.x + Math.abs(d.y) * R)/dr2;
    var y2 = (-D*d.x - Math.abs(d.y) * R)/dr2;

    var l1 = (x1 - s.x) / d.x;
    var l2 = (x2 - s.x) / d.x;

    // Check if intersection point is on line segment;
    // choose intersection point closer to p
    if (l1 >= 0 && l1 <= 1 && l1 <= l2) {
        return {"lat": x1 + m.lat, "lng": y1 + m.lon, "lambda": l1};
    } else if (l2 >= 0 && l2 <= 1) {
        return {"lat": x2 + m.lat, "lng": y2 + m.lon, "lambda": l2};
    } else {
        return null;
    }
}

function pad0 (val, length=2, base=10) {
    var result = val.toString(base)
    while (result.length < length) result = '0' + result;
    return result;
}

function raceDistance (course) {
    var dist = 0;
    for (i = 1; i < course.length; i++) {
        dist += gcDistance(course[i-1], course[i]);
    }
    return dist;
}

function roundTo(number, digits) {
    if (number !== undefined && !isNaN(number)) {
        var scale = Math.pow(10, digits);
        return (Math.round(number * scale) / scale).toFixed(digits);
    } else {
        return "-";
    }
}

function sign(x) {
    return (x < 0) ? -1 : 1;
}

function toDeg(angle) {
    return angle / Math.PI * 180;
}

function toDMS(number) {
    var u = sign(number);
    number = Math.abs(number);
    var g = Math.floor(number);
    var frac = number - g;
    var m = Math.floor(frac * 60);
    frac = frac - m / 60;
    var s = Math.floor(frac * 3600);
    var cs = roundTo(360000 * (frac - s / 3600), 0);
    while (cs >= 100) {
        cs = cs - 100;
        s = s + 1;
    }
    return {
        "u": u,
        "g": g,
        "m": m,
        "s": s,
        "cs": cs
    };
}

function toRad(angle) {
    return angle / 180 * Math.PI;
}


export { angle,
         addDistance,
         courseAngle,
         formatDDMMYY,
         formatDHMS,
         formatHHMMSSSS,
         formatHMS,
         formatMS,
         formatPosition,
         gcAngle,
         gcDistance,
         intersectionPoint,
         pad0,
         raceDistance,
         roundTo,
         sign,
         toDeg,
         toDMS,
         toRad
       };

