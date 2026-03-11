/**
 * UoG Ground Station — Avionics Packet Protocol v1
 *
 * Copy this header file into your avionics firmware (STM32, Arduino, ESP32, etc.)
 * Pair with the JSON schema: src/schemas/protocols/uog_binary_v1.json
 *
 * The ground station will automatically parse packets matching this struct
 * sent over any serial/UART interface at any baud rate.
 */
#pragma once
#include <stdint.h>

/* ── Frame constants ────────────────────────────────────────────────── */
#define UOG_SYNC1    0xAAu
#define UOG_SYNC2    0x55u
#define UOG_PKT_SIZE 76u   /* sizeof(TelemetryPacket_t) */

/* ── Flight state machine enum ──────────────────────────────────────── */
typedef enum {
    STATE_IDLE     = 0,
    STATE_PAD      = 1,
    STATE_BOOST    = 2,
    STATE_COAST    = 3,
    STATE_APOGEE   = 4,
    STATE_DESCENT  = 5,
    STATE_LANDED   = 6,
} FlightState_t;

/* ── Telemetry packet (packed — no struct padding) ──────────────────── */
typedef struct __attribute__((packed)) {
    /* Header */
    uint8_t  sync1;           /* offset  0 — always 0xAA                          */
    uint8_t  sync2;           /* offset  1 — always 0x55                          */
    uint16_t seq;             /* offset  2 — monotonic packet counter              */
    uint32_t timestamp_ms;    /* offset  4 — MCU uptime in milliseconds            */

    /* IMU */
    float    pitch;           /* offset  8 — degrees, nose-up positive             */
    float    yaw;             /* offset 12 — degrees, clockwise positive           */
    float    roll;            /* offset 16 — degrees                               */

    /* Accelerometer (raw, gravity included) */
    float    accel_x;         /* offset 20 — m/s²                                  */
    float    accel_y;         /* offset 24 — m/s²                                  */
    float    accel_z;         /* offset 28 — m/s² (~9.81 at rest)                  */

    /* Gyroscope */
    float    gyro_x;          /* offset 32 — deg/s                                 */
    float    gyro_y;          /* offset 36 — deg/s                                 */
    float    gyro_z;          /* offset 40 — deg/s                                 */

    /* GPS */
    float    latitude;        /* offset 44 — decimal degrees                       */
    float    longitude;       /* offset 48 — decimal degrees                       */
    float    altitude_m;      /* offset 52 — meters above sea level                */

    /* Barometric */
    float    pressure_hpa;    /* offset 56 — hPa                                   */
    float    temperature_c;   /* offset 60 — °C                                    */

    /* Power */
    float    battery_v;       /* offset 64 — volts                                 */

    /* RF link */
    int16_t  rssi_dbm;        /* offset 68 — dBm                                   */

    /* GPS metadata */
    uint8_t  gps_fix;         /* offset 70 — 0=no fix, 1=fix                       */
    uint8_t  gps_sats;        /* offset 71 — number of satellites                  */

    /* State machine */
    uint8_t  flight_state;    /* offset 72 — FlightState_t enum                    */
    uint8_t  _reserved;       /* offset 73 — padding (set to 0)                    */

    /* Frame integrity */
    uint16_t crc16;           /* offset 74 — CRC-16/CCITT of bytes [0..73]         */
} TelemetryPacket_t;          /* total: 76 bytes                                   */

/* Compile-time size check */
_Static_assert(sizeof(TelemetryPacket_t) == UOG_PKT_SIZE,
               "TelemetryPacket_t size mismatch — check struct packing");


/* ── CRC-16/CCITT (polynomial 0x1021, init 0xFFFF) ─────────────────── */
static inline uint16_t uog_crc16(const uint8_t *data, uint16_t len) {
    uint16_t crc = 0xFFFFu;
    for (uint16_t i = 0; i < len; i++) {
        crc ^= (uint16_t)data[i] << 8;
        for (uint8_t j = 0; j < 8; j++) {
            crc = (crc & 0x8000u) ? (crc << 1) ^ 0x1021u : crc << 1;
        }
    }
    return crc;
}


/* ── Transmit helper (STM32 HAL example) ────────────────────────────── */
/*
 * Usage:
 *   TelemetryPacket_t pkt = {0};
 *   pkt.seq          = ++packet_seq;
 *   pkt.timestamp_ms = HAL_GetTick();
 *   pkt.pitch        = imu_pitch;
 *   // ... fill remaining fields ...
 *   uog_send_packet(&huart2, &pkt);
 */
#ifdef HAL_UART_MODULE_ENABLED
#include "usart.h"
static inline HAL_StatusTypeDef uog_send_packet(UART_HandleTypeDef *huart,
                                                  TelemetryPacket_t  *pkt) {
    pkt->sync1 = UOG_SYNC1;
    pkt->sync2 = UOG_SYNC2;
    pkt->crc16 = uog_crc16((const uint8_t *)pkt,
                             sizeof(TelemetryPacket_t) - sizeof(uint16_t));
    return HAL_UART_Transmit(huart, (uint8_t *)pkt,
                              sizeof(TelemetryPacket_t), 100);
}
#endif /* HAL_UART_MODULE_ENABLED */


/* ── Arduino / ESP32 helper ─────────────────────────────────────────── */
/*
 * Usage:
 *   TelemetryPacket_t pkt = {};
 *   pkt.seq          = ++seq;
 *   pkt.timestamp_ms = millis();
 *   pkt.pitch        = myIMU.pitch();
 *   // ... fill remaining fields ...
 *   uog_serial_send(&Serial1, &pkt);
 */
#if defined(ARDUINO)
#include <Arduino.h>
static inline void uog_serial_send(HardwareSerial *port,
                                    TelemetryPacket_t *pkt) {
    pkt->sync1 = UOG_SYNC1;
    pkt->sync2 = UOG_SYNC2;
    pkt->crc16 = uog_crc16((const uint8_t *)pkt,
                             sizeof(TelemetryPacket_t) - sizeof(uint16_t));
    port->write((const uint8_t *)pkt, sizeof(TelemetryPacket_t));
}
#endif /* ARDUINO */
