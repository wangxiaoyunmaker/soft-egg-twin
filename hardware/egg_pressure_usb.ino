/*
 * Example for a classic Arduino Uno/Nano with six analog pressure inputs.
 * Each sensor needs the appropriate voltage divider / conditioning circuit.
 * Change pins for your board; do not connect voltages above its ADC rating.
 * Reports raw 10-bit ADC counts at approximately 50 Hz, 115200 baud.
 * Import examples/sensors-arduino-10bit.json in the app before connecting.
 */
const uint8_t SENSOR_PINS[] = {A0, A1, A2, A3, A4, A5};
const char* SENSOR_IDS[] = {"top", "left", "front", "right", "back", "base"};
const uint8_t SENSOR_COUNT = sizeof(SENSOR_PINS) / sizeof(SENSOR_PINS[0]);
unsigned long lastSample = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  if (millis() - lastSample < 20) return;
  lastSample = millis();
  Serial.print("{\"pressure\":{");
  for (uint8_t i = 0; i < SENSOR_COUNT; i++) {
    if (i) Serial.print(',');
    Serial.print('"'); Serial.print(SENSOR_IDS[i]); Serial.print("\":");
    Serial.print(analogRead(SENSOR_PINS[i]));
  }
  Serial.println("},\"normalized\":false}");
}
