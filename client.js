"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiteClient = exports.getTon4ClientTonhub = exports.getTon4ClientOrbs = exports.getTon4Client = exports.intToIP = void 0;
const ton_1 = require("@ton/ton");
const axios_1 = __importDefault(require("axios"));
const ton_lite_client_1 = require("ton-lite-client");
const ton_access_1 = require("@orbs-network/ton-access");
let lc4 = undefined;
let lc = undefined;
let lcOrbs = undefined;
let lcHub = undefined;
let createLiteClient;
function intToIP(int) {
    const part1 = int & 255;
    const part2 = (int >> 8) & 255;
    const part3 = (int >> 16) & 255;
    const part4 = (int >> 24) & 255;
    return `${part4}.${part3}.${part2}.${part1}`;
}
exports.intToIP = intToIP;
function getTon4Client(_configUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (lc4) {
            return lc4;
        }
        lc4 = new ton_1.TonClient4({ endpoint: _configUrl !== null && _configUrl !== void 0 ? _configUrl : yield (0, ton_access_1.getHttpV4Endpoint)() });
        return lc4;
    });
}
exports.getTon4Client = getTon4Client;
function getTon4ClientOrbs(_configUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (lcOrbs) {
            return lcOrbs;
        }
        lcOrbs = new ton_1.TonClient4({ endpoint: _configUrl !== null && _configUrl !== void 0 ? _configUrl : yield (0, ton_access_1.getHttpV4Endpoint)() });
        return lcOrbs;
    });
}
exports.getTon4ClientOrbs = getTon4ClientOrbs;
function getTon4ClientTonhub(_configUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (lcHub) {
            return lcHub;
        }
        lcHub = new ton_1.TonClient4({ endpoint: _configUrl !== null && _configUrl !== void 0 ? _configUrl : 'https://mainnet-v4.tonhubapi.com' });
        return lcHub;
    });
}
exports.getTon4ClientTonhub = getTon4ClientTonhub;
function getLiteClient(_configUrl) {
    return __awaiter(this, void 0, void 0, function* () {
        if (lc) {
            return lc;
        }
        if (!createLiteClient) {
            createLiteClient = (() => __awaiter(this, void 0, void 0, function* () {
                const { data } = yield (0, axios_1.default)(_configUrl);
                // const data = JSON.parse(fs.readFileSync('ton-global.config', {encoding: 'utf8'}))
                const liteServers = data.liteservers;
                const engines = [];
                for (const server of liteServers) {
                    const ls = server;
                    engines.push(new ton_lite_client_1.LiteSingleEngine({
                        host: `tcp://${intToIP(ls.ip)}:${ls.port}`,
                        publicKey: Buffer.from(ls.id.key, 'base64'),
                    }));
                }
                const engine = new ton_lite_client_1.LiteRoundRobinEngine(engines);
                const lc2 = new ton_lite_client_1.LiteClient({
                    engine,
                    batchSize: 1,
                });
                lc = lc2;
            }))();
        }
        yield createLiteClient;
        return lc;
    });
}
exports.getLiteClient = getLiteClient;
