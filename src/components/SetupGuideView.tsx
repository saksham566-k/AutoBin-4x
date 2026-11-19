import React from 'react';
import { AlertTriangle, CheckCircle2, Usb, Wrench } from 'lucide-react';

export const SetupGuideView: React.FC = () => {
  const steps = [
    {
      num: '01.',
      title: 'Verify Hardware Wiring & Servo Power',
      body: 'Confirm HC-SR04 (Trig D6, Echo D7), LM393 Moisture (DO D4, AO A0), Metal Touch Sensor (D2), and MG996R Servo (D9). Because the MG996R draws high stall current, power the servo from an external 5V–6V supply and tie its GND to the Arduino Uno GND so the board does not brown-out or reset mid-sort.',
    },
    {
      num: '02.',
      title: 'Upload Firmware via Arduino IDE',
      body: 'Open AutoBin4x_Telemetry.ino in Arduino IDE, select Board: Arduino Uno and your USB COM/tty port, and click Upload. Either the upgraded telemetry sketch or your original sketch works immediately with this dashboard.',
    },
    {
      num: '03.',
      title: 'Close the Arduino IDE Serial Monitor',
      body: 'Operating systems allow only one program to hold a serial port open at a time. Before connecting from your browser, close the Arduino IDE Serial Monitor and Serial Plotter completely so the COM port is unlocked.',
    },
    {
      num: '04.',
      title: 'Connect via Web Serial in Chrome or Edge',
      body: 'Use Google Chrome, Microsoft Edge, or Opera on desktop. Keep baud rate at 9600 (matching Serial.begin(9600)), click Connect Arduino, and pick your Arduino Uno / USB-Serial CH340 / ATmega16U2 port from the browser prompt.',
    },
  ];

  const troubleshootingItems = [
    {
      issue: '"Failed to open serial port" or port missing',
      cause: 'Arduino IDE Serial Monitor, another browser tab, or a Python/Node script is locking the COM port.',
      fix: 'Close Arduino IDE Serial Monitor, unplug/replug the USB cable, and click Connect Arduino again.',
    },
    {
      issue: 'Garbled characters in Raw Serial Monitor',
      cause: 'Baud rate mismatch between the sketch and the browser selector.',
      fix: 'Ensure the baud dropdown is set to 9600 to match Serial.begin(9600) in your sketch.',
    },
    {
      issue: 'Arduino disconnects right when the servo moves',
      cause: 'MG996R servo current spike pulls USB 5V low and resets the Uno.',
      fix: 'Power the MG996R from an external 5V 2A adapter/battery pack with shared common GND.',
    },
    {
      issue: 'Wet / Metal categories trigger backwards',
      cause: 'Sensor module polarity differs (some LM393 or touch sensors are active-HIGH vs active-LOW).',
      fix: 'Flip WET_ACTIVE_STATE or METAL_ACTIVE_STATE between HIGH and LOW at the top of your sketch.',
    },
    {
      issue: 'Web Serial API blocked inside embedded iframe',
      cause: 'Browser security policies can restrict navigator.serial inside third-party preview iframes.',
      fix: 'Open the app directly in its own Chrome/Edge tab, or download the Standalone Single-File HTML from the Arduino Sketch tab.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Step-by-step setup */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2">
          <Usb className="w-4 h-4 text-slate-700" />
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Hardware Setup & Connection Guide
          </h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
          Follow these four steps to stream real-time waste segregation counts from your Arduino Uno
          into the browser over USB Serial.
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {steps.map((step) => (
            <div key={step.num} className="border border-slate-200 rounded-lg p-5 bg-slate-50/50">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="font-mono text-slate-500">{step.num}</span>
                <span>{step.title}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Important Port Lock Reminder:</span> Always close the
            Arduino IDE Serial Monitor before clicking <span className="font-semibold">Connect Arduino</span>.
            If Arduino IDE has the COM port open, Web Serial cannot claim the port.
          </div>
        </div>
      </section>

      {/* Troubleshooting Table */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-slate-700" />
          <h2 className="text-base font-semibold text-slate-900">
            Troubleshooting Common Issues
          </h2>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {troubleshootingItems.map((item) => (
            <div key={item.issue} className="py-4 grid grid-cols-1 lg:grid-cols-12 gap-3 text-sm">
              <div className="lg:col-span-4 font-semibold text-slate-900">{item.issue}</div>
              <div className="lg:col-span-4 text-slate-600">
                <span className="text-xs font-medium text-slate-500 block mb-0.5">Likely Cause</span>
                {item.cause}
              </div>
              <div className="lg:col-span-4 text-slate-700 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-medium text-slate-500 block mb-0.5">Resolution</span>
                  {item.fix}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
