////////////////////////////////////////////////////////////////////////////////
// NMEA messages

import * as Util from './util.js';

var settings = {
    "proxyPort": "8081",
    "nmeaInterval": 1000,
    "aisInterval": 60000
}

var running = false;

var crcTable = makeCRCTable();

var nmeaTimer;
var aisTimer;

function start (races, raceFleetMap, isDisplay) {
    if (running) {
        return;
    } else {
        running = true,
        sendNMEA(races);
        nmeaTimer = window.setInterval(sendNMEA, settings.nmeaInterval, races);
        sendAIS(races, raceFleetMap, isDisplay);
        aisTimer = window.setInterval(sendAIS, settings.aisInterval, races, raceFleetMap, isDisplay);
    }
}

function stop () {
    if (!running) {
        return;
    } else {
        running = false;
        window.clearInterval(nmeaTimer);
        window.clearInterval(aisTimer);
    }
}

function sendNMEA (races) {
    try {
        races.forEach(function (r) {
            if (r.curr) {
                var rmc = formatGPRMC(r.curr);
                var mwv = formatIIMWV(r.curr);
                var vwr = formatIIVWR(r.curr);
                var hdt = formatIIHDT(r.curr);
                sendSentence(r.id, "$" + rmc + "*" + nmeaChecksum(rmc));
                sendSentence(r.id, "$" + mwv + "*" + nmeaChecksum(mwv));
                sendSentence(r.id, "$" + vwr + "*" + nmeaChecksum(vwr));
                sendSentence(r.id, "$" + hdt + "*" + nmeaChecksum(hdt));
            }
        });
    } catch (e) {
        alert (e);
    }
}

// Send fleet through NMEA/AIS
function sendAIS (races, raceFleetMap, isDisplay) {
    races.forEach( function (r) {
        if (r.curr) {
            
            var fleet = raceFleetMap.get(r.id);
            
            // For each opponent
            Object.keys(fleet.uinfo).forEach( function (uid) {
                var info = fleet.uinfo[uid];
                
                if (isDisplay(info, uid) && (info.displayName != r.curr.displayName)) {
                    // Add a mmsi base on displayName (30 bits for AIS message)
                    if (!info.mmsi) {
                        info.mmsi = crc32(info.displayName) & 0x3FFFFFFF;
                    }
                    // Send position report data (Type1)
                    var aivdm = formatAIVDM_AIS_msg1(info.mmsi, info);
                    sendSentence(r.id, "!" + aivdm + "*" + nmeaChecksum(aivdm));
                    // Send static and voyage related data (Type5)
                    aivdm = formatAIVDM_AIS_msg5(info.mmsi, info);
                    sendSentence(r.id, "!" + aivdm + "*" + nmeaChecksum(aivdm));
                }
            });
        }
    });
}

function sendSentence (raceId, sentence) {
    var request = new XMLHttpRequest();
    request.open("POST", "http://localhost:" + settings.proxyPort + "/nmea/" + raceId, true);
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    request.onerror = function (data) {
        console.log(data);
    };
    request.send(sentence);
}

function formatGPRMC (m) {
    // http://www.nmea.de/nmea0183datensaetze.html#rmc
    // https://gpsd.gitlab.io/gpsd/NMEA.html#_rmc_recommended_minimum_navigation_information
    var d = new Date(m.lastCalcDate || new Date());
    var s = "GPRMC";
    s += "," + Util.formatHHMMSSSS(d) + ",A";             // UTC time & status
    s += "," + formatNMEALatLon(Math.abs(m.pos.lat), 11); // Latitude & N/S
    s += "," + ((m.pos.lat < 0) ? "S":"N");
    s += "," + formatNMEALatLon(Math.abs(m.pos.lon), 12); // Longitude & E/W
    s += "," + ((m.pos.lon < 0) ? "W":"E");
    s += "," + m.speed.toFixed(5);                        // SOG
    s += "," + m.heading.toFixed(5);                      // Track made good
    s += "," + Util.formatDDMMYY(d);                      // Date
    s += ",,";                                            //
    s += ",A";                                            // Valid
    return s;
}

function formatIIMWV (m) {
    // $IIMWV Wind Speed and Angle
    var s = "IIMWV";
    var tws = m.tws || 0;
    var twa = m.twa || 0;
    var pTWA = (twa > 0) ? twa : twa + 360;
    s += "," + pTWA + ",T";
    s += "," + tws + ",N";
    s += ",A"
    return s;
}

function formatIIVWR (m) {
    // VWR - Relative Wind Speed and Angle
    // --VWR,x.x,a,x.x,N,x.x,M,x.x,K
    // https://gpsd.gitlab.io/gpsd/NMEA.html#_vwr_relative_wind_speed_and_angle

    var tws = m.tws || 0;
    var twa = m.twa || 0;
    var sog = m.speed || 0;

    // Cosinus law
    var cosTwaLaw = Math.cos(Util.toRad(180 - Math.abs(twa)));
    var aws = Math.sqrt(sog**2 + tws**2 - 2 * sog * tws * cosTwaLaw);
    var awd = Util.toDeg(Math.acos((sog**2 + aws**2 - tws**2) / (2 * sog * aws)));
    var awside = (twa < 0) ? "L" : "R";

    // The message
    var s = "IIVWR";
    s += "," + awd.toFixed(5);
    s += "," + awside;
    s += "," + aws.toFixed(5) + ",N";
    s += ",,,,";
    return s;
}

function formatIIHDT (m) {
    // HDT - Heading - True
    // --HDT,x.x,T
    // https://gpsd.gitlab.io/gpsd/NMEA.html#_hdt_heading_true
    
    var s = "IIHDT";
    s += "," + m.heading.toFixed(5) + ",T";
    return s;
}

function formatNMEALatLon (l, len) {
    var deg = Math.trunc(l);
    var min = Util.pad0(((l - deg) * 60).toFixed(6), 9);
    var result = "" + deg + min;
    return Util.pad0(result, len);
}

function formatAIVDM_AIS_msg1 (mmsi, uinfo) {
    // https://castoo.pagesperso-orange.fr/navigation/analys_nmea_ais.html
    var s = "AIVDM";
    s += "," + "1";                                        // number of fragment
    s += "," + "1";                                        // fragment number
    s += "," + "";                                         // message id
    s += "," + "B";                                        // Radio Canal
    s += "," + formatUtilAIVDM_AIS_msg1(mmsi, uinfo);      // payload
    s += ",0"                                              // padding

    return s;
}

function formatAIVDM_AIS_msg5 (mmsi, uinfo) {
    // https://castoo.pagesperso-orange.fr/navigation/analys_nmea_ais.html
    var s = "AIVDM";
    s += "," + "1";                                        // number of fragment
    s += "," + "1";                                        // fragment number
    s += "," + "";                                         // message id
    s += "," + "B";                                        // Radio Canal
    s += "," + formatUtilAIVDM_AIS_msg5(mmsi, uinfo);      // payload
    s += ",4"                                              // padding

    return s;
}

function formatUtilAIVDM_AIS_msg1 (mmsi, uinfo) {
    var bitArray = [];

    bitArray += longToBitArray(1, 6);                                       // Message type 1
    bitArray += longToBitArray(0, 2);                                       // Message repeat indicator

    bitArray += longToBitArray(mmsi, 30) ;                                  // Boat MMSI
    bitArray += longToBitArray(8, 4);                                       // Nav status -> Navigation
    bitArray += longToBitArray(0, 8);                                       // Rot - rotate level
    bitArray += longToBitArray(Util.roundTo(uinfo.speed * 10, 0), 10);      // SOG
    bitArray += longToBitArray(0, 1);                                       // Position accuracy

    bitArray += longToBitArray(Util.roundTo(uinfo.pos.lon * 10000 * 60, 0), 28); // Longitude
    bitArray += longToBitArray(Util.roundTo(uinfo.pos.lat * 10000 * 60, 0), 27); // Latitude
    bitArray += longToBitArray(uinfo.heading*10, 12);                       // COG
    bitArray += longToBitArray(uinfo.heading, 9);                           // HDG
    bitArray += longToBitArray(13, 6);                                      // Time stamp
    bitArray += longToBitArray(0, 1);                                       // other / reserved
    bitArray += longToBitArray(81942, 24);                                  // other / reserved

    // Convert bitArray to ASCII
    var str = bitArray2ASCII(bitArray);

    return str;
}

function formatUtilAIVDM_AIS_msg5 (mmsi, uinfo) {
    var bitArray = [];

    bitArray += longToBitArray(5, 6);                                       // Message type 5
    bitArray += longToBitArray(0, 2);                                       // Message repeat indicator

    bitArray += longToBitArray(mmsi, 30);                                   // Boat MMSI
    bitArray += longToBitArray(0, 2);                                       // AIS Version
    bitArray += longToBitArray(uinfo.mmsi, 30);                             // IMO Number
    bitArray += longToBitArray(0, 42);                                      // Call Sign - 7 six-bit characters
    bitArray += stringToSixBitArray(uinfo.displayName, 120/6);              // Vessel Name - 20 six-bit characters
    bitArray += longToBitArray(36, 8);                                      // Ship Type => Sailing
    bitArray += longToBitArray(0, 9);                                       // Dimension to Bow
    bitArray += longToBitArray(0, 9);                                       // Dimension to Stern
    bitArray += longToBitArray(0, 6);                                       // Dimension to Port
    bitArray += longToBitArray(0, 6);                                       // Dimension to Starboard
    bitArray += longToBitArray(0, 4);                                       // Position Fix Type => Undefined
    bitArray += longToBitArray(0, 4);                                       // ETA month => Undefined
    bitArray += longToBitArray(0, 5);                                       // ETA day => Undefined
    bitArray += longToBitArray(0, 5);                                       // ETA hour => Undefined
    bitArray += longToBitArray(0, 6);                                       // ETA minute => Undefined
    bitArray += longToBitArray(0, 8);                                       // Draught
    bitArray += longToBitArray(0, 120);                                     // Destination - 20 six-bit characters
    bitArray += longToBitArray(1, 1);                                       // DTE => 1 == Not ready (default)
    bitArray += longToBitArray(0, 1);                                       // Spare

    // Convert bitArray to ASCII
    var str = bitArray2ASCII(bitArray);
    return str;
}

function nmeaChecksum (s) {
    var sum = 0;
    for (var i = 0; i < s.length; i++) {
        sum ^= s.charCodeAt(i);
    }
    return Util.pad0(sum, 2, 16).toUpperCase();
}

function longToBitArray (long, array_size) {
    var bitArray = [];

    for ( var index = 0; index < array_size ; index ++ ) {
        var byte = long & 1;
        bitArray = [byte] + bitArray;
        long = long >> 1 ;
    }

    return bitArray;
};

function stringToSixBitArray (s, sixBitsArraySize) {
    var bitArray = [];
    s = s.toUpperCase();
    for (var i = 0; i < Math.min(s.length, sixBitsArraySize); i++)
    {
        var b = s.charCodeAt(i);
        bitArray += longToBitArray((b | 64) & 63, 6);
    }
    // Pad with spaces (32)
    if ( s.length < sixBitsArraySize) {
        //bitArray += longToBitArray(0, 6);
        for (var i = 0; i < sixBitsArraySize - s.length; i++) {
            bitArray += longToBitArray(32, 6);
        }
    }
    return bitArray;
};

function bitArray2ASCII (bitArray) {
    // * Prepare conversion
    var map_bit_to_ascii = {};

    for (var i =48; i < 128; i++) {
        var chr_val = i - 48;
        if (chr_val > 40) {
            chr_val = chr_val - 8;
        }

        var bits = longToBitArray(chr_val, 6);

        if ( map_bit_to_ascii[bits] == undefined) {
            map_bit_to_ascii[bits] = String.fromCharCode(i);
        } else {
            if (String.fromCharCode(i) == "`") {
                map_bit_to_ascii[bits] = String.fromCharCode(i);
            }
        }
    }

    // * Convert
    // Pad the bitArray to a round length of 6 bits
    bitArray += longToBitArray(0, 6 - (bitArray.length % 6));
    var str = "";
    for (var i = 0; i < (bitArray.length / 6); i++) {
        str += map_bit_to_ascii[bitArray.slice(i * 6, i * 6 + 6)];
    }

    return str;
}

function makeCRCTable () {
    var c;
    var crcTable = [];
    for (var n =0; n < 256; n++) {
        c = n;
        for (var k =0; k < 8; k++) {
            c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}

function crc32(str) {

    var crc = 0 ^ (-1);

    for (var i = 0; i < str.length; i++ ) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0;
};

export {
    settings,
    start,
    stop
};

/// EOF
///////////////////////////////////////////////////////////////////////////////

