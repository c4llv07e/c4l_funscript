"use strict";

// Difference mode: vibration = abs(previous_value - current_value)
// Maybe it's better for vibrating butt plugs, idk.
// TODO(c4): Try CFAR for this.

// Invert mode: vibration = 100 - current_value
// SPOILER: It won't help, some scipt makers are assholes and they're
// writing it only for strokers. Try find different script.

let client = null; // Buttplug.io client
let devices = []; // List of all devices
let device_latency = 0; // ping to device for funscript offset
let device_latencies; // TODO(c4ll): Make ping individual for each device
let script; // Raw script values
let current_ind = -1; // Script value index that is playing right now
                      // Finding it on the fly is too slow, so we store it
let script_min_interval = 10; // Minimal interval between device updates
                              // Required for loop waiting update
let last_power_value = 0; // Previous value for device for difference mode

// Try connect to the buttplug server
const main_connect = async () => {
  const address = intiface_address_input.value;
  let connector = new Buttplug
      .ButtplugBrowserWebsocketClientConnector(address);
  client = new Buttplug.ButtplugClient("c4l funscript player");
  client.addListener("deviceadded", (device) => {
    devices.push(device);
    console.log(`Device Connected: ${device.name}`);
  });
  client.addListener("deviceremoved", (device) => {
    devices.pop(device);
    console.log(`Device Removed: ${device.name}`)
  });
  try {
    client.connect(connector);
  } catch (ex) {
    console.error(ex);
  };
};

const main_disconnect = async () => {
  if (client !== null) {
    client.disconnect();
  };
  client = null;
  devices = [];
};

const vibrate_all = async (value) => {
  // console.log(`vibrating at ${value}`);
  for (const device of devices) {
    if (device.vibrateAttributes.length === 0) {
      continue;
    };
    try {
      await device.vibrate(value);
    } catch (ex) {
      console.error(ex);
      if (ex instanceof Buttplug.ButtplugDeviceError) {
        console.warn("Got device error!");
      };
    };
  };
};

const vibrate_all_stop = async () => {
  // console.log("all vibration stopped");
  if (client === null) {
    return;
  };
  await client.stopAllDevices();
};

const main_test_vibrate = async () => {
  await vibrate_all(vibration_rate_input.value / 100);
  await new Promise(r => setTimeout(r, 1000));
  await vibrate_all_stop();
};

// Find current power value index in the script
const update_current_ind = () => {
  if (script === null) {
    return;
  };
  // Current position in milis
  const at = fun_player.currentTime.toFixed(3) * 1000 + device_latency;
  current_ind = 0;
  // Iterate until power next power value time is lower then current time
  while (script.actions[current_ind + 1].at <= at) {
    current_ind += 1;
  };
};

// Find minimum time between two power values in script
// Required for better idle time waiting without droping frames
const update_interval = () => {
  if (script === null) {
    return;
  };
  script_min_interval = -1;
  for (let i = 0; i < script.actions.length - 1; i += 1) {
    let cur = script.actions[i + 1].at - script.actions[i].at;
    if (script_min_interval === -1 || cur < script_min_interval) {
      script_min_interval = cur;
    };
  };
};

intiface_connect_button.onclick = async () => {
  await main_connect();
};

intiface_disconnect_button.onclick = async () => {
  await main_disconnect();
};

test_vibrate_button.onclick = async () => {
  await main_test_vibrate();
};

// On video file uploaded
video_upload.addEventListener("change", function() {
  const file = this.files[0];
  // I don't really know if I should keep this check. I think users are not
  // idiots.
  // (if file isn't empty and is a video)
  if (file !== null && file.type.startsWith("video/")) {
    // Create base64 encoded data stream
    const video_url = URL.createObjectURL(file);
    // Use it as a video stream
    fun_player.src = video_url;
    // Fuck browser DOM, because of cause it needs seperate function to
    // update video
    fun_player.load();
  } else {
    console.error(`Expected video, got ${file.type}`);
  };
});

// On script file uploaded
script_upload.addEventListener("change", function() {
  const file = this.files[0];
  if (!file) {
    return;
  };
  const reader = new FileReader();
  reader.onload = function (event) {
    // Some strange json decoding (I thought json is a native JS format)
    try {
      const script_text = event.target.result;
      script = JSON.parse(script_text);
    } catch (ex) {
      console.error(`Error at parsing funscript: ${ex}`);
      return;
    };
    // Cache some cool values
    update_interval();
    update_current_ind();
  };
  // Cause we NEED this fucking functional shit in browser
  reader.readAsText(file);
});

// Called every script_min_interval milis
const update_func = async () => {
  if (script == null || fun_player.paused) {
    return;
  };
  const at = fun_player.currentTime.toFixed(3) * 1000 + device_latency;
  // console.log(at);
  // Update current index in script
  while (script.actions.length > current_ind + 1 &&
         script.actions[current_ind + 1].at <= at) {
    current_ind += 1;
  };
  // If there's no values, just return
  if (current_ind === -1) {
    return;
  };
  let power = 0;
  // See comment on the top
  if (difference_mode_input.checked) {
    let value = (script.actions[current_ind].pos / 100);
    power = value - last_power_value;
    last_power_value = value;
  } else {
    power = script.actions[current_ind].pos / 100;
    if (invert_mode_input.checked) {
      power = 1.0 - power;
    }
  };
  // console.log(power);
  // No per device support right now.
  await vibrate_all(Math.abs(power) *
    vibration_rate_input.value / 100);
};

// Main loop
(async () => {
  while (true) {
    await update_func();
    // I miss C's sleep(3)
    await new Promise(r => setTimeout(r, script_min_interval));
  };
})();

// Update device ping
// Right now it uses battery info for this because it doesn't change
// device's state.
setInterval(async () => {
  if (devices.length === 0) {
    return;
  };
  let device = devices[0];
  let t0 = performance.now();
  await device.battery();
  let t1 = performance.now();
  device_latency = (t1 - t0) / 2.0;
}, 200);

// Update current index everytime user changes playback
fun_player.addEventListener('play', update_current_ind);
fun_player.addEventListener('seeked', update_current_ind);

// Because if we don't, it will vibrate FOREVER!!
fun_player.addEventListener('pause', () => {
  vibrate_all_stop();
});

// Just trying to cache address with fallback value. Shoot me in the head
if (intiface_address_input.value === "") {
  intiface_address_input.value = "ws://localhost:12345";
};
