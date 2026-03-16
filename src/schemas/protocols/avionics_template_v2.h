/**
 * UoG Ground Station - Sensor Stack Protocol v2
 *
 * Copy this header file into your avionics firmware (STM32, Arduino, ESP32, etc.).
 * Pair with JSON schema: src/schemas/protocols/uog_sensor_stack_v2.json
 */
#pragma once
#include <stdint.h>

/* Frame constants */
#define UOG_SYNC1       0xAAu
#define UOG_SYNC2       0x55u
#define UOG_V2_PKT_SIZE 88u

typedef enum {
    STATE_IDLE     = 0,
    STATE_PAD      = 1,
    STATE_BOOST    = 2,
    STATE_COAST    = 3,
    STATE_APOGEE   = 4,
    STATE_DESCENT  = 5,
    STATE_LANDED   = 6,
} FlightState_t;

typedef struct __attribute__((packed)) {
    /* Header */
    uint8_t  sync1;            /* 0 */
    uint8_t  sync2;            /* 1 */
    uint16_t seq;              /* 2 */
    uint32_t timestamp_ms;     /* 4 */

    /* IMU */
    float    pitch;            /* 8 */
    float    yaw;              /* 12 */
    float    roll;             /* 16 */

    /* Accelerometer */
    float    accel_x;          /* 20 */
    float    accel_y;          /* 24 */
    float    accel_z;          /* 28 */

    /* Gyroscope */
    float    gyro_x;           /* 32 */
    float    gyro_y;           /* 36 */
    float    gyro_z;           /* 40 */

    /* GPS */
    float    latitude;         /* 44 */
    float    longitude;        /* 48 */
    float    altitude_m;       /* 52 */

    /* Barometer */
    float    pressure_hpa;     /* 56 */
    float    temperature_c;    /* 60 */

    /* Power and link */
    float    battery_v;        /* 64 */
    int16_t  rssi_dbm;         /* 68 */

    /* GPS metadata */
    uint8_t  gps_fix;          /* 70 */
    uint8_t  gps_sats;         /* 71 */

    /* Spectrometer */
    float    spec_450nm;       /* 72 */
    float    spec_550nm;       /* 76 */
    float    spec_680nm;       /* 80 */

    /* Flight state */
    uint8_t  flight_state;     /* 84 */
    uint8_t  _reserved;        /* 85 */

    /* Frame integrity */
    uint16_t crc16;            /* 86 */
} TelemetryPacketV2_t;

_Static_assert(sizeof(TelemetryPacketV2_t) == UOG_V2_PKT_SIZE,
               "TelemetryPacketV2_t size mismatch");

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

#ifdef HAL_UART_MODULE_ENABLED
#include "usart.h"
static inline HAL_StatusTypeDef uog_send_packet_v2(UART_HandleTypeDef *huart,
                                                    TelemetryPacketV2_t *pkt) {
    pkt->sync1 = UOG_SYNC1;
    pkt->sync2 = UOG_SYNC2;
    pkt->crc16 = uog_crc16((const uint8_t *)pkt,
                           sizeof(TelemetryPacketV2_t) - sizeof(uint16_t));
    return HAL_UART_Transmit(huart,
                             (uint8_t *)pkt,
                             sizeof(TelemetryPacketV2_t),
                             100);
}
#endif

#if defined(ARDUINO)
#include <Arduino.h>
static inline void uog_serial_send_v2(HardwareSerial *port, TelemetryPacketV2_t *pkt) {
    pkt->sync1 = UOG_SYNC1;
    pkt->sync2 = UOG_SYNC2;
    pkt->crc16 = uog_crc16((const uint8_t *)pkt,
                           sizeof(TelemetryPacketV2_t) - sizeof(uint16_t));
    port->write((const uint8_t *)pkt, sizeof(TelemetryPacketV2_t));
}
#endif
