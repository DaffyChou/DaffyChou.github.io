# AIS 智慧監控平台 — 後端與資料庫設計

> 對應前端 Demo：[`SDataPro/AIS_Platform_Demo.html`](./AIS_Platform_Demo.html)
>
> 文件範疇：真實 AIS 資料來源串接方案、訊息攝取管線、資料庫欄位設計、ER 圖（DBML）、索引與分區策略、API 對應關係。
>
> 目標讀者：後端工程師、資料工程師、系統架構師。

---

## 目錄

1. [系統定位與範疇](#1-系統定位與範疇)
2. [AIS 資料來源選擇](#2-ais-資料來源選擇)
3. [整體架構](#3-整體架構)
4. [NMEA AIVDM 訊息解析](#4-nmea-aivdm-訊息解析)
5. [資料庫選型](#5-資料庫選型)
6. [資料庫欄位設計](#6-資料庫欄位設計)
7. [ER 圖（DBML）](#7-er-圖dbml)
8. [索引與分區策略](#8-索引與分區策略)
9. [Demo 功能 ↔ 資料表對應](#9-demo-功能--資料表對應)
10. [API Layer 設計建議](#10-api-layer-設計建議)
11. [部署與運維](#11-部署與運維)

---

## 1. 系統定位與範疇

本平台是**岸端船隊監控戰情室（Shore-side Fleet War Room）**，覆蓋下列模組：

| 模組 | 功能 |
|---|---|
| 船隊總覽 Fleet Overview | 自有船即時位置、狀態、ETA、外來觀測船 |
| AIS 訊號品質 Signal Quality | 完整度、位置連續性、更新頻率、異常偵測 |
| 港口擁塞 Port Congestion | CI 指數、等候時間、ETA 影響預測 |
| CPA 風險 CPA Risk | 兩船最近會遇點、TCPA、事件中心、回放、稽核 |
| 航線管理 Passage Plan | 多版本航線、Waypoint、XTD 偏移監控 |
| 警報通知 Notifications | Email / LINE / Telegram / Webhook 推播 |

**關鍵原則**：本系統為「岸端監控與稽核工具」，**不取代船端 ECDIS / 避碰設備**。

---

## 2. AIS 資料來源選擇

### 2.1 來源類型比較

| 來源 | 覆蓋範圍 | 延遲 | 成本 | 連線方式 | 適用 |
|---|---|---|---|---|---|
| **自建岸基接收器**（dAISy / RTL-SDR + AIS 解調） | 沿岸 40 nm 內 | < 5s | 低（一次性硬體） | TCP/UDP NMEA 串流 | 港區、河口監控 |
| **公開聚合站**（AISHub、MarineTraffic Free） | 全球（覆蓋稀疏） | 30s–數分 | 免費需共享自有站 | TCP 推送 | 開發/Demo |
| **商用衛星 AIS**（Spire Maritime、ORBCOMM、exactEarth） | 全球海域 | 5–30 分（部分 < 5 分） | 訂閱（USD 數千/月起） | REST / WebSocket / Kafka | 大洋追蹤、合規 |
| **商用陸基 + 衛星混合**（MarineTraffic API、VesselFinder） | 全球 | 1–10 分 | 訂閱 | REST / WebSocket | 商業應用首選 |
| **官方 VTS**（港務局、海巡） | 特定海域 | 即時 | 需簽 MOU | 專線 / VPN + NMEA | 國家級監控 |

### 2.2 推薦混合策略

```
┌────────────────────────────────────────────────────────────┐
│  混合來源策略（依優先級回退）                                  │
├────────────────────────────────────────────────────────────┤
│  Priority 1: 自有港區接收器（< 5s 延遲, 100% 覆蓋本地）         │
│       ↓ (船隻離開岸基覆蓋)                                    │
│  Priority 2: 商用 API（MarineTraffic / Spire, < 5 min）       │
│       ↓ (跨洋大洋區)                                          │
│  Priority 3: 純衛星 AIS（Spire, 5–30 min）                   │
│                                                            │
│  Fallback: 預估推算（DR, Dead Reckoning）                    │
│   → 標記 isDr = true, dataConf 自動扣分                      │
└────────────────────────────────────────────────────────────┘
```

> 對應 Demo：`cpaEvents[].isDr` 與 `dataConf` 欄位。

### 2.3 連線範例

#### A. NMEA TCP 串流（自建接收器）

```python
import socket

def stream_nmea(host='192.168.1.50', port=10110):
    """連線 AIS 接收器的 NMEA 串流（如 dAISy HAT、AISCatcher、OpenCPN AIS Server）"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((host, port))
    buf = b''
    while True:
        buf += s.recv(4096)
        while b'\r\n' in buf:
            line, buf = buf.split(b'\r\n', 1)
            yield line.decode('ascii', errors='ignore')

# 用法
for sentence in stream_nmea():
    if sentence.startswith('!AIVDM') or sentence.startswith('!AIVDO'):
        publish_to_kafka(sentence)
```

#### B. WebSocket（AISStream.io 免費、MarineTraffic、Spire）

```javascript
// Node.js 範例（AISStream.io 免費實時串流）
import WebSocket from 'ws';

const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

ws.on('open', () => {
  ws.send(JSON.stringify({
    APIKey: process.env.AISSTREAM_KEY,
    BoundingBoxes: [[[20, 118], [26, 124]]],  // 台灣海峽
    FiltersShipMMSI: ['416001001', '416001005'],
    FilterMessageTypes: ['PositionReport', 'ShipStaticData']
  }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  // msg.MessageType / msg.MetaData.MMSI / msg.Message.PositionReport
  ingestQueue.publish('ais.raw', msg);
});
```

#### C. REST 輪詢（適合非即時報表）

```bash
# MarineTraffic API
curl "https://services.marinetraffic.com/api/exportvessels/v:8/{API_KEY}/timespan:10/protocol:jsono" \
  | jq '.[] | {mmsi:.MMSI, lat:.LAT, lon:.LON, sog:.SPEED, cog:.COURSE, ts:.TIMESTAMP}'
```

---

## 3. 整體架構

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 岸基接收器     │   │ 商用 API      │   │ 衛星 AIS      │
│ (dAISy/SDR)   │   │ (MarineTraf.) │   │ (Spire)      │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │ NMEA              │ JSON              │ JSON
       └─────────┬─────────┴───────────────────┘
                 ▼
          ┌─────────────┐
          │  Ingestor    │  ← Go / Rust / Node
          │  (解析 + 去重) │
          └──────┬──────┘
                 ▼
          ┌─────────────┐
          │   Kafka      │  topics: ais.raw, ais.parsed, ais.position
          │   / NATS     │
          └──────┬──────┘
                 ▼
       ┌──────────────────┐
       │  Stream Processor │  ← Flink / Kafka Streams / Bytewax
       │  - 位置寫入        │
       │  - CPA 計算       │
       │  - 訊號品質指標     │
       │  - 港口進出偵測     │
       │  - 異常偵測 (D1_GAP)│
       └─────────┬────────┘
                 ▼
   ┌───────────────────────────────┐
   │  PostgreSQL + PostGIS          │
   │  + TimescaleDB（位置/事件時序）  │
   └─────────────┬─────────────────┘
                 ▲
                 │ Read
   ┌─────────────┴─────────────┐
   │   REST/GraphQL API         │  ← Node.js / Python (FastAPI)
   │   + WebSocket（即時推送）    │
   └─────────────┬─────────────┘
                 ▼
       ┌──────────────────┐
       │  前端 Demo Web    │
       │  (Leaflet, vanilla)│
       └──────────────────┘
                 ▲
                 │ 推送
       ┌─────────┴────────┐
       │ Notification Svc │ ← Email / LINE / Telegram / Webhook
       └──────────────────┘
```

### 模組職責

| 元件 | 職責 | 推薦技術 |
|---|---|---|
| Ingestor | NMEA AIVDM 拼接、解碼、去重 | Go（pyais 對應） / `libais` |
| Message Queue | 解耦攝取與處理 | Kafka / NATS JetStream |
| Stream Processor | 即時計算 CPA、訊號品質、CI | Apache Flink / Bytewax |
| OLTP DB | 主資料、CRUD | PostgreSQL 15+ + PostGIS 3.4 |
| Time-series | 位置歷史、回放 | TimescaleDB Hypertable |
| Cache | 最新位置查詢 | Redis（hash by MMSI） |
| Search | 跨欄位搜尋（船名/MMSI） | PostgreSQL trigram or Elasticsearch |
| API | 對外服務 | FastAPI / NestJS |
| Notification | 多通道警報 | 自建或第三方（Twilio for SMS） |

---

## 4. NMEA AIVDM 訊息解析

### 4.1 重要訊息類型

| Type | 名稱 | 頻率 | 取得欄位 |
|---|---|---|---|
| 1, 2, 3 | Class A Position Report | 2–10 秒 | MMSI, 經緯度, SOG, COG, heading, NavStatus, RoT |
| 5 | Class A Static & Voyage | 6 分鐘 | IMO, Name, CallSign, ShipType, dimensions, Destination, ETA, Draught |
| 18, 19 | Class B Position | 30 秒 | 同 Type 1（無 NavStatus） |
| 24 | Class B Static | 6 分鐘 | Name, ShipType, CallSign, dimensions |
| 21 | Aid to Navigation | 3 分鐘 | 浮標、燈塔（用於航道辨識） |
| 27 | Long-range AIS | 衛星 | 簡化位置（精度較低） |

### 4.2 多句拼接

AIS Type 5 / 24 常分為多句（fragment）：

```
!AIVDM,2,1,9,A,55NBP=02<sg4@G@WR21LU84pB1HE9TpN0HE9TpN0000000017,0*5C
!AIVDM,2,2,9,A,000000ND;qH88888888880,2*26
```

`!AIVDM,<fragCnt>,<fragIdx>,<seqId>,<channel>,<payload>,<fillBits>*<chksum>`

Ingestor 須依 `seqId` + `channel` 暫存重組，超時（10 秒）丟棄。

### 4.3 推薦解析庫

| 語言 | 函式庫 |
|---|---|
| Python | [`pyais`](https://github.com/M0r13n/pyais) |
| Node.js | [`ais-decoder`](https://www.npmjs.com/package/ais-decoder) |
| Go | [`go-ais`](https://github.com/BertoldVdb/go-ais) |
| Rust | [`ais`](https://crates.io/crates/ais) |
| C++ | [`libais`](https://github.com/schwehr/libais) |

---

## 5. 資料庫選型

### 5.1 推薦組合

```
PostgreSQL 15+ （主資料、關聯、ACID）
  └─ PostGIS 3.4+ （地理空間查詢：港口、海域多邊形、距離計算）
  └─ TimescaleDB 2.x （位置歷史、CPA 事件時序的 hypertable）
  └─ pg_partman（依日期自動分區）
```

**為什麼不分開放：**
單一 PostgreSQL 兼顧關聯（船舶/航次/事件）、空間（PostGIS）、時序（TimescaleDB），免去資料同步成本。資料量到達 10 億筆/月以上再考慮拆分。

### 5.2 規模試算

| 場景 | 預估數據量 |
|---|---|
| 自有船 50 艘 × 每 10 秒一筆位置 | 432K rows/day, ~13M rows/month |
| 觀測 1000 艘外來船（5nm 內）× 平均 30 秒 | 2.88M rows/day |
| CPA 事件 50 件/天 × 平均 30 個快照 | 1500 rows/day |
| 稽核紀錄 200 條/天 | 6000 rows/month |

→ 主壓力在 `vessel_positions`，每月 ~100M 筆，**必須做 hypertable + retention policy**。

---

## 6. 資料庫欄位設計

> 完整 DBML 見 [§7](#7-er-圖dbml)。本節聚焦關鍵欄位語意。

### 6.1 vessels — 船舶主檔

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mmsi` | bigint **PK** | 海事行動業務識別碼（9 碼，唯一） |
| `imo` | int | 國際海事組織編號（永久；MMSI 可變更，IMO 不可） |
| `name` | varchar(50) | 船名（可隨時變更） |
| `callsign` | varchar(10) | 呼號 |
| `ship_type` | int | AIS Type 5 ShipType（0–99，FK 對照表） |
| `ship_type_label` | varchar(30) | 衍生：Bulk Carrier / Container / Tanker... |
| `flag` | varchar(2) | ISO 3166-1 alpha-2 國旗代碼，`INSUF` 表示資料不足 |
| `length_m` | numeric(5,1) | 船長（公尺） |
| `width_m` | numeric(4,1) | 船寬 |
| `dwt` | int | 載重噸（人工維護或外部資料源補上） |
| `first_seen_at` | timestamptz | 系統首次收到此 MMSI 訊號的時間 |
| `last_seen_at` | timestamptz | 最後收到訊號的時間（每筆 position 更新） |
| `is_active` | boolean | 30 天內有訊號 = true |

> 對應 Demo：`ownFleet[].mmsi/imo/name/type/dwt/callsign/flag` + `surroundingObs[].mmsi/name/flag/type`

### 6.2 fleet_ownership — 自有船歸屬（多租戶）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `org_id` | uuid **PK** | 公司/組織 ID |
| `mmsi` | bigint **PK** | 船舶 |
| `since` | date | 自何時起屬於本組織（賣船/換手） |
| `until` | date | NULL 代表至今 |

> 同一 MMSI 可能歷史上屬於不同公司，需用時間區段紀錄。

### 6.3 voyages — 航次

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `mmsi` | bigint **FK** | |
| `voyage_code` | varchar(20) | 公司內部航次代碼（V25-014） |
| `origin_port` | varchar(10) **FK→ports** | |
| `dest_port` | varchar(10) **FK→ports** | |
| `eta_original` | timestamptz | 出港時宣告的 ETA |
| `eta_dynamic` | timestamptz | 系統動態推算 ETA |
| `draught_m` | numeric(4,2) | 吃水 |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | NULL 表示進行中 |
| `status` | enum | planned / underway / completed / cancelled |

> 對應 Demo：`ownFleet[].voyage/from/dest/etaO/etaD/draught`

### 6.4 vessel_positions — 位置時序（Hypertable）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mmsi` | bigint **FK** | |
| `ts` | timestamptz | AIS 訊息時戳（**主分區鍵**） |
| `received_at` | timestamptz | 系統接收時間（用於計算延遲） |
| `lat` | numeric(9,6) | |
| `lon` | numeric(9,6) | |
| `geom` | geography(POINT,4326) | **PostGIS generated column** from lat/lon |
| `sog` | numeric(4,1) | Speed Over Ground (knots) |
| `cog` | numeric(4,1) | Course Over Ground (degrees) |
| `heading` | numeric(4,1) | True heading（NULL if invalid 511） |
| `nav_status` | smallint | AIS NavStatus 0–15 |
| `rot` | numeric(5,1) | Rate of Turn（deg/min） |
| `source` | enum | terrestrial / satellite / synthesized_dr |
| `source_station` | varchar(50) | 接收站 ID（自有站 ID 或 API provider） |
| `accuracy` | smallint | 0/1（AIS positionAccuracy） |
| `is_dr` | boolean | true = DR 推算非實測 |
| `raw_msg_id` | uuid | 對應 ais_messages_raw（可選保留） |

**分區策略**：`ts` 為時間維度做 TimescaleDB hypertable，1 天一個 chunk，**自動 retention 180 天**（超出降為日聚合落入 `vessel_positions_daily`）。

> 對應 Demo：`ownFleet[].lat/lon/sog/cog/last(秒)` — `last` 衍生自 `now() - last_position.ts`。

### 6.5 ais_quality_metrics — AIS 訊號品質（彙整指標）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `mmsi` | bigint **PK** | |
| `window_start` | timestamptz **PK** | 計算視窗起點（如每 5 分鐘） |
| `window_end` | timestamptz | |
| `completeness` | numeric(3,2) | 必要欄位完整度 0.00–1.00 |
| `position_continuity` | numeric(3,2) | 位置連續性（無大跳點） |
| `update_interval_ms` | int | 平均更新間隔 |
| `time_source` | enum | NTP / AIS1 / AIS17 / SYS（時戳來源） |
| `time_confidence` | enum | H / M / L |
| `rtt_ms` | int | 端到端延遲（訊號發出 → 系統接收） |
| `anomaly_type` | varchar(40) | 訊號中斷 / 欄位缺漏 / 延遲... |
| `score` | smallint | 0–100 綜合分 |

> 對應 Demo：`ownAISQ` 衍生物件

### 6.6 vessel_observations — 外來船觀測

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `foreign_mmsi` | bigint **FK→vessels** | 被觀測者 |
| `observer_mmsi` | bigint **FK→vessels** | 觀測者（自有船） |
| `first_seen_at` | timestamptz | |
| `last_seen_at` | timestamptz | |
| `last_range_nm` | numeric(4,1) | 最後一次看到的距離 |
| `update_interval_ms` | int | |
| `field_completeness` | numeric(3,2) | |
| `behavior` | enum | underway / anchored / approaching / unknown |
| `disappear_state` | enum | live / gap / exited |
| `confidence` | numeric(3,2) | 觀測可信度 |
| `quality_level` | enum | high / med / low / insuf |

> 對應 Demo：`surroundingObs[]`

### 6.7 ports — 港口主檔

| 欄位 | 型別 | 說明 |
|---|---|---|
| `code` | varchar(10) **PK** | UN/LOCODE（KHH = TWKHH） |
| `name_zh` | varchar(50) | 高雄港 |
| `name_en` | varchar(80) | Kaohsiung |
| `country` | varchar(2) | ISO 3166-1 |
| `region` | varchar(30) | Taiwan / SE Asia / NE Asia... |
| `lat` | numeric(9,6) | 港心 |
| `lon` | numeric(9,6) | |
| `area_geom` | geography(POLYGON,4326) | 港區邊界（用於進出偵測） |
| `anchorage_geom` | geography(POLYGON,4326) | 錨地 |
| `offshore_lat_offset` | numeric(5,2) | Demo 用 mini-map 偏移 |
| `offshore_lon_offset` | numeric(5,2) | |

> 對應 Demo：`allPorts[]`

### 6.8 port_congestion — 港口擁塞指數（時序）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `port_code` | varchar(10) **FK** | |
| `ts` | timestamptz | 計算時間（如每小時） |
| `ci` | numeric(3,2) | Congestion Index 0–1 |
| `level` | enum | normal / light / moderate / high |
| `data_confidence` | enum | high / med / low / insuf |
| `own_vessels` | smallint | 觀測時自有船在港數 |
| `foreign_vessels` | smallint | 觀測時外來船在港數 |
| `avg_wait_hours` | numeric(4,1) | 平均等候時間 |
| `eta_impact` | boolean | 是否預期影響 ETA |
| `training_samples` | int | 已用於訓練的歷史樣本數 |
| `zone_confidence` | numeric(3,2) | 港區劃定可信度 |

> Hypertable，retention 2 年。

### 6.9 port_calls — 進出港紀錄

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `mmsi` | bigint **FK** | |
| `port_code` | varchar(10) **FK** | |
| `voyage_id` | uuid **FK** | |
| `arrival_ts` | timestamptz | 進入港區的時間 |
| `berth_ts` | timestamptz | 靠泊時間 |
| `depart_ts` | timestamptz | 離開時間 |
| `wait_hours` | numeric(4,1) | 衍生：berth - arrival |

### 6.10 cpa_events — CPA 風險事件

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | varchar(16) **PK** | EV-001 格式 |
| `created_at` | timestamptz | |
| `resolved_at` | timestamptz | |
| `level` | enum | RED / AMBER |
| `status` | enum | new / ack / monitoring / resolved / closed |
| `own_mmsi` | bigint **FK** | |
| `target_mmsi` | bigint **FK** | |
| `cpa_nm` | numeric(4,2) | 最近會遇點距離 |
| `tcpa_min` | numeric(5,1) | 到達 CPA 的剩餘時間 |
| `confidence` | smallint | 0–100 |
| `dr_seconds` | int | 目標 DR 推算秒數（越久越不準） |
| `is_dr` | boolean | 目標位置是否為 DR |
| `bearing` | numeric(4,1) | 目標相對方位 |
| `range_nm` | numeric(4,1) | 目前距離 |
| `area` | varchar(80) | 海域描述（衍生自 hotspots） |
| `own_sog` | numeric(4,1) | |
| `target_sog` | numeric(4,1) | |
| `encounter_angle` | numeric(4,1) | 相遇角度 |
| `encounter_type` | enum | head-on / crossing / overtaking |
| `data_confidence` | numeric(3,2) | |
| `push_channels` | jsonb | `["Email","LINE","Telegram"]` |

> 對應 Demo：`cpaEvents[]`

### 6.11 cpa_event_snapshots — 事件回放快照

| 欄位 | 型別 | 說明 |
|---|---|---|
| `event_id` | varchar(16) **FK** | |
| `ts` | timestamptz | |
| `own_lat/lon` | numeric(9,6) | |
| `target_lat/lon` | numeric(9,6) | |
| `cpa_nm` | numeric(4,2) | 當下計算的 CPA |
| `tcpa_min` | numeric(5,1) | |
| `is_cpa_point` | boolean | 是否為最近會遇瞬間 |

> 提供事件回放（Demo 中事件回放畫面）。每事件 ~30 筆，可於事件解除後 90 天歸檔。

### 6.12 audit_log — 操作稽核

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | varchar(16) **PK** | AUD-001 |
| `event_id` | varchar(16) **FK→cpa_events** | |
| `action` | enum | New / Notified / Viewed / Acknowledged / Comment / Resolved / Closed / Playback |
| `operator_user_id` | uuid **FK→users** | NULL 表示 System |
| `operator_role` | varchar(30) | Marine Mgr. / Operator / System |
| `status_before` | varchar(20) | |
| `status_after` | varchar(20) | |
| `comment` | text | |
| `ts` | timestamptz | |

> 對應 Demo：`auditLog[]`

### 6.13 risk_hotspots / risk_vessels — 統計彙整（物化視圖）

可實作為 PostgreSQL Materialized View，每小時 refresh：

```sql
CREATE MATERIALIZED VIEW risk_hotspots_30d AS
SELECT area, COUNT(*) AS event_count, MIN(cpa_nm) AS peak_cpa
FROM cpa_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY area
ORDER BY event_count DESC;
```

### 6.14 passage_plans / plan_versions / waypoints — 航線計畫

#### passage_plans

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `voyage_id` | uuid **FK** | |
| `mmsi` | bigint **FK** | |
| `from_port` | varchar(10) **FK→ports** | |
| `to_port` | varchar(10) **FK→ports** | |
| `active_version_id` | uuid **FK→plan_versions** | |
| `xtd_max_nm` | numeric(4,2) | 允許最大偏移 |

#### plan_versions

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `plan_id` | uuid **FK** | |
| `version` | varchar(10) | v1.0 / v1.1 |
| `status` | enum | pending / active / superseded / archived |
| `source` | varchar(30) | WNI 氣導 / StormGeo / DTN |
| `created_at` | timestamptz | |
| `effective_at` | timestamptz | |
| `summary` | text | 變更說明 |

#### waypoints

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `plan_version_id` | uuid **FK** | |
| `seq` | smallint | 順序 |
| `name` | varchar(50) | 可空 |
| `lat` | numeric(9,6) | |
| `lon` | numeric(9,6) | |
| `geom` | geography(POINT,4326) | |
| `speed_kn` | numeric(4,1) | 計畫速度 |
| `xtd_limit_nm` | numeric(4,2) | 此段允許偏移 |
| `eta_at` | timestamptz | 預計到達 |
| `passed_at` | timestamptz | 實際通過 |

> 對應 Demo：`passagePlans[mmsi].versions[]` 與 `.waypoints[]`

### 6.15 xtd_records — Cross-Track Deviation 時序

| 欄位 | 型別 | 說明 |
|---|---|---|
| `plan_version_id` | uuid **FK** | |
| `ts` | timestamptz | |
| `xtd_nm` | numeric(5,2) | |
| `current_waypoint_seq` | smallint | |

Hypertable，retention 1 年。

### 6.16 deviation_events — 偏移事件（超出 xtd_max）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `plan_version_id` | uuid **FK** | |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz | NULL 表示持續中 |
| `peak_xtd_nm` | numeric(5,2) | |
| `duration_min` | int | |
| `cause` | varchar(40) | 氣象 / 避碰 / 不明 |

### 6.17 notification_rules / notifications

#### notification_rules

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `org_id` | uuid **FK** | |
| `name` | varchar(80) | |
| `trigger_type` | enum | cpa / ais_gap / port_congestion / route_deviation |
| `conditions` | jsonb | 規則表達式 |
| `channels` | jsonb | `["email:ops@x.com","line:U123","telegram:-100..."]` |
| `cooldown_min` | int | 同類重複壓制秒數 |
| `enabled` | boolean | |

#### notifications

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | uuid **PK** | |
| `rule_id` | uuid **FK** | |
| `event_id` | varchar(16) **FK→cpa_events** | nullable |
| `channel` | varchar(20) | email / line / telegram / webhook |
| `recipient` | varchar(120) | |
| `payload` | jsonb | |
| `sent_at` | timestamptz | |
| `delivery_status` | enum | queued / sent / failed / bounced |
| `error` | text | |

### 6.18 organizations / users / roles

```
organizations(id, name, created_at)
users(id, org_id, email, name, role, created_at, last_login_at)
roles: enum('admin','marine_mgr','operator','viewer','system')
```

---

## 7. ER 圖（DBML）

完整 DBML schema 獨立存放於 [`AIS_Schema.dbml`](./AIS_Schema.dbml)（與本文件同目錄）。

### 7.1 視覺化

| 方式 | 操作 |
|---|---|
| 線上互動 | 開啟 [dbdiagram.io](https://dbdiagram.io) → New Diagram → 貼上 `AIS_Schema.dbml` 內容 |
| 本機 SVG | `npm i -g @dbml/cli` → `dbml-renderer -i AIS_Schema.dbml -o AIS_Schema.svg` |
| 產 PostgreSQL DDL | `dbml2sql AIS_Schema.dbml --postgres > AIS_Schema.sql` |
| 產 MySQL / SQL Server DDL | `dbml2sql AIS_Schema.dbml --mysql` / `--mssql` |

### 7.2 Schema 概覽

```
organizations ─┬─ users
               └─ fleet_ownership ─┐
                                   │
ports ───┬─── voyages ── passage_plans ── plan_versions ── waypoints
         │       │              │              │              │
         ├── port_calls          │              │              └─ (geom GIST)
         ├── port_congestion (hypertable)       │
         │                                      ├─ xtd_records (hypertable)
         │                                      └─ deviation_events
         │
vessels ─┼─ vessel_positions (hypertable, GIST)
         ├─ ais_quality_metrics
         ├─ vessel_observations  (observer ↔ foreign 自參照)
         ├─ ais_messages_raw
         └─ cpa_events ─┬─ cpa_event_snapshots (hypertable)
                        ├─ audit_log
                        └─ notifications ── notification_rules
```

### 7.3 表清單（22 張）

| 分類 | 表 | 類型 |
|---|---|---|
| 多租戶 | `organizations`, `users`, `fleet_ownership` | 主檔 |
| 船舶 | `vessels` | 主檔 |
| 航次 | `voyages` | 交易 |
| 位置時序 | `vessel_positions`, `ais_messages_raw`, `ais_quality_metrics` | hypertable / cold |
| 觀測 | `vessel_observations` | 交易 |
| 港口 | `ports`, `port_congestion`, `port_calls` | 主檔 + hypertable |
| CPA | `cpa_events`, `cpa_event_snapshots`, `audit_log` | 交易 + hypertable |
| 航線 | `passage_plans`, `plan_versions`, `waypoints`, `xtd_records`, `deviation_events` | 交易 + hypertable |
| 通知 | `notification_rules`, `notifications` | 設定 + 交易 |

> 各表欄位語意見 [§6](#6-資料庫欄位設計)；查詢範例見 [§9](#9-demo--資料表對應)。

---

## 8. 索引與分區策略

### 8.1 TimescaleDB Hypertable 設定

```sql
-- vessel_positions: 主時序表
SELECT create_hypertable('vessel_positions', 'ts', chunk_time_interval => INTERVAL '1 day');
SELECT add_retention_policy('vessel_positions', INTERVAL '180 days');
SELECT add_compression_policy('vessel_positions', INTERVAL '7 days');  -- 7 天後壓縮

-- port_congestion
SELECT create_hypertable('port_congestion', 'ts', chunk_time_interval => INTERVAL '7 days');
SELECT add_retention_policy('port_congestion', INTERVAL '730 days');

-- cpa_event_snapshots
SELECT create_hypertable('cpa_event_snapshots', 'ts', chunk_time_interval => INTERVAL '7 days');
SELECT add_retention_policy('cpa_event_snapshots', INTERVAL '365 days');

-- xtd_records
SELECT create_hypertable('xtd_records', 'ts', chunk_time_interval => INTERVAL '7 days');
SELECT add_retention_policy('xtd_records', INTERVAL '365 days');
```

### 8.2 必要索引

```sql
-- 取最新位置（極熱查詢）
CREATE INDEX idx_positions_latest ON vessel_positions (mmsi, ts DESC);

-- 空間查詢（在某海域內的船）
CREATE INDEX idx_positions_geom ON vessel_positions USING GIST (geom);

-- 船名模糊搜尋
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_vessels_name_trgm ON vessels USING GIN (name gin_trgm_ops);

-- 活躍事件
CREATE INDEX idx_events_active ON cpa_events (status, level, created_at DESC)
  WHERE status IN ('new', 'ack');
```

### 8.3 連續聚合（降採樣）

```sql
-- 1 小時聚合視圖（給歷史回放/熱點分析使用）
CREATE MATERIALIZED VIEW vessel_positions_1h
WITH (timescaledb.continuous) AS
SELECT mmsi,
       time_bucket('1 hour', ts) AS bucket,
       avg(lat) AS lat, avg(lon) AS lon,
       avg(sog) AS sog,
       count(*) AS reports
FROM vessel_positions
GROUP BY mmsi, bucket;

SELECT add_continuous_aggregate_policy('vessel_positions_1h',
  start_offset => INTERVAL '2 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes');
```

---

## 9. Demo 功能 ↔ 資料表對應

| Demo 功能 | 主要查詢 | 涉及表 |
|---|---|---|
| 船隊風險總覽（清單） | 每艘自有船的活躍 CPA 事件數彙整 | `vessels`, `fleet_ownership`, `cpa_events` |
| 船隊即時位置（地圖） | 取每艘自有船最近一筆 `vessel_positions` | `vessels`, `vessel_positions` |
| 外來觀測船 popup | 自有船最近觀測到的外來 MMSI | `vessel_observations`, `vessels` |
| AIS 訊號品質 | 最近 5 分鐘指標 | `ais_quality_metrics` |
| 港口擁塞清單 | 最新 `port_congestion` per port | `ports`, `port_congestion` |
| 港口 mini-map | 港口位置 + offset | `ports` |
| CPA 事件中心 | 全部活躍事件 | `cpa_events`, `cpa_event_snapshots` |
| 事件回放 | 事件期間快照 | `cpa_event_snapshots` |
| 稽核紀錄 | 依事件/操作員/時間過濾 | `audit_log`, `users` |
| 熱點海域 30d | `cpa_events` 依 area 統計 | `cpa_events`（或物化視圖） |
| 高風險船舶 30d | `cpa_events` 依 own_mmsi 統計 | `cpa_events`, `vessels` |
| Passage Plan 版本 | 一條 plan 的歷史版本 | `passage_plans`, `plan_versions`, `waypoints` |
| XTD 即時 | 最新 `xtd_records` | `xtd_records` |
| 偏移事件清單 | XTD 超限事件 | `deviation_events` |
| Toast 警報 | 最近 N 分鐘 active 事件 | `cpa_events`, `notifications` |

### 9.1 範例查詢：船隊風險清單（對應 Demo 中的「船隊即時風險」）

```sql
-- 給定 org_id，列出所有自有船的目前風險狀態
WITH active_events AS (
  SELECT
    own_mmsi,
    COUNT(*) FILTER (WHERE level = 'RED'   AND status IN ('new','ack')) AS red,
    COUNT(*) FILTER (WHERE level = 'AMBER' AND status IN ('new','ack')) AS amber,
    COUNT(*) FILTER (WHERE status IN ('resolved','closed')
                      AND resolved_at > NOW() - INTERVAL '30 days')      AS resolved_30d
  FROM cpa_events
  GROUP BY own_mmsi
)
SELECT
  v.mmsi, v.name, v.imo,
  COALESCE(e.red, 0)          AS red,
  COALESCE(e.amber, 0)        AS amber,
  COALESCE(e.resolved_30d, 0) AS resolved_30d,
  CASE
    WHEN COALESCE(e.red, 0)   > 0 THEN 'red'
    WHEN COALESCE(e.amber, 0) > 0 THEN 'amber'
    ELSE 'ok'
  END AS overall
FROM vessels v
JOIN fleet_ownership f ON f.mmsi = v.mmsi
LEFT JOIN active_events e ON e.own_mmsi = v.mmsi
WHERE f.org_id = $1 AND f.until IS NULL
ORDER BY overall = 'red' DESC, overall = 'amber' DESC, red DESC, amber DESC;
```

### 9.2 範例查詢：船隊地圖（每艘船最新位置）

```sql
-- LATERAL JOIN 拿每艘船最新位置（PostgreSQL/TimescaleDB 慣用模式）
SELECT v.mmsi, v.name, p.lat, p.lon, p.sog, p.cog, p.ts,
       EXTRACT(EPOCH FROM (NOW() - p.ts))::int AS age_seconds
FROM vessels v
JOIN fleet_ownership f ON f.mmsi = v.mmsi AND f.org_id = $1 AND f.until IS NULL
LEFT JOIN LATERAL (
  SELECT lat, lon, sog, cog, ts
  FROM vessel_positions
  WHERE mmsi = v.mmsi
  ORDER BY ts DESC
  LIMIT 1
) p ON true;
```

---

## 10. API Layer 設計建議

### 10.1 REST 端點對應

| 端點 | 方法 | 對應 Demo 區塊 |
|---|---|---|
| `/api/fleet/risk` | GET | 船隊風險總覽清單 |
| `/api/fleet/positions` | GET | 地圖即時位置 |
| `/api/vessels/{mmsi}` | GET | 船舶詳細 modal |
| `/api/vessels/{mmsi}/positions?from=&to=` | GET | 歷史軌跡 |
| `/api/observations` | GET | 外來觀測船 |
| `/api/ais-quality` | GET | AIS 訊號品質 |
| `/api/ports` | GET | 港口清單 |
| `/api/ports/{code}/congestion?from=&to=` | GET | 擁塞趨勢 |
| `/api/cpa/events?status=&level=` | GET | 事件中心 |
| `/api/cpa/events/{id}` | GET | 事件詳細 |
| `/api/cpa/events/{id}/playback` | GET | 回放快照 |
| `/api/cpa/events/{id}/audit` | GET | 該事件稽核 |
| `/api/cpa/events/{id}/ack` | POST | 確認事件 |
| `/api/cpa/events/{id}/resolve` | POST | 解除事件 |
| `/api/plans?mmsi=` | GET | 航線計畫清單 |
| `/api/plans/{id}/versions` | GET | 版本歷史 |
| `/api/plans/{id}/waypoints?version=` | GET | Waypoints |

### 10.2 WebSocket 推送

```
ws://api/ws/fleet

事件類型：
  - vessel.position.update    每艘船位置更新（節流為 2.5s/船）
  - cpa.event.created
  - cpa.event.updated         status 變化
  - notification.toast        toast 警報
  - port.congestion.update    CI 變動
```

---

## 11. 部署與運維

### 11.1 最小可行架構（< 100 艘船）

```
1 × PostgreSQL 15 + PostGIS + TimescaleDB（4 vCPU / 16GB RAM / 500GB NVMe SSD）
1 × Redis（快取最新位置，1GB 即可）
1 × API Server（2 vCPU / 4GB）
1 × Ingestor（1 vCPU / 2GB，watchdog 監控連線）
1 × Stream Processor（4 vCPU / 8GB，跑 CPA 計算）
```

### 11.2 監控指標（給 Prometheus / Grafana）

- `ais_messages_received_total{source,station}` 攝取速率
- `ais_position_lag_seconds` 訊號發出 → DB 落地延遲（P50/P95/P99）
- `cpa_events_active_total{level}` 活躍事件數
- `vessel_positions_chunk_size_bytes` 各 chunk 體積
- `db_connection_pool_used / max`

### 11.3 資料保留策略總表

| 表 | 保留期 | 降採樣後保留 |
|---|---|---|
| `vessel_positions` | 180 天原始 | 1 小時聚合保留 5 年 |
| `ais_messages_raw` | 30 天 | 不留 |
| `port_congestion` | 2 年原始 | 1 天聚合永久 |
| `cpa_event_snapshots` | 1 年 | — |
| `xtd_records` | 1 年 | 1 小時聚合保留 3 年 |
| `audit_log` | 永久 | — |
| `notifications` | 90 天 | — |

### 11.4 災難復原

- PostgreSQL 連續 WAL 歸檔至 S3 / MinIO，每日 base backup
- Kafka 設定 7 天保留，確保即使 DB 故障 1 天內可重放
- Ingestor 從 Kafka 重放時依 `(mmsi, ts)` 主鍵冪等（`ON CONFLICT DO NOTHING`）

### 11.5 法規與隱私

- AIS 訊號是公開無線電廣播，**MMSI/位置非個資**；但若關聯船東/操作員資料需符合 GDPR / 個資法
- `users` 表的 `email` 與 `audit_log.operator_user_id` 須加密儲存或定期 anonymize
- 若為政府或軍事相關監控，需評估是否落地境內、是否涉及機敏資料分級

---

## 附錄 A：AIS NavStatus 對照（type 1/2/3 field）

| Value | 意義 | 對應 Demo `status` |
|---|---|---|
| 0 | Under way using engine | underway |
| 1 | At anchor | anchored |
| 2 | Not under command | — |
| 3 | Restricted maneuverability | — |
| 4 | Constrained by her draught | — |
| 5 | Moored | berthed |
| 6 | Aground | — |
| 7 | Engaged in fishing | — |
| 8 | Under way sailing | underway |
| 9–14 | Reserved | — |
| 15 | Undefined | ais_issue |

> Demo 中 `approaching` / `departing` 為衍生狀態（依 SOG + 距港距離計算）。

## 附錄 B：參考連結

- IMO AIS 規範：[ITU-R M.1371-5](https://www.itu.int/rec/R-REC-M.1371)
- pyais 文件：https://pyais.readthedocs.io
- AISStream.io 免費實時 AIS：https://aisstream.io
- TimescaleDB 文件：https://docs.timescale.com
- PostGIS 文件：https://postgis.net/documentation/
- DBML 規範：https://www.dbml.org

---

*文件版本：v1.0 · 對應前端 commit `8d74a33`（2026-05-18）*
