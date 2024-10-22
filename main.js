let client = null;
let devices = [];
let script;
let current_ind = -1;
let script_min_interval = 10;
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
};

const vibrate_all = async (value) => {
  // console.log(`vibrating at ${value}`);
  for (const device of devices) {
    if (device.vibrateAttributes.length == 0) {
      continue;
    };
    try {
      await device.vibrate(value);
    } catch (ex) {
      console.error(ex);
      if (e instanceof Buttplug.ButtplugDeviceError) {
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

const update_current_ind = () => {
  if (script === null) {
    return;
  };
  const at = fun_player.currentTime.toFixed(3) * 1000;
  current_ind = 0;
  while (script.actions[current_ind + 1].at <= at) {
    current_ind += 1;
  };
};

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

video_upload.addEventListener("change", function() {
  const file = this.files[0];
  // I don't really know if I should keep this check. I think users are not
  // idiots.
  if (file !== null && file.type.startsWith("video/")) {
    const video_url = URL.createObjectURL(file);
    fun_player.src = video_url;
    fun_player.load();
    fun_player.play();
  } else {
    console.error(`Expected video, got ${file.type}`);
  };
});

script_upload.addEventListener("change", function() {
  const file = this.files[0];
  if (!file) {
    return;
  };
  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const script_text = event.target.result;
      script = JSON.parse(script_text);
      update_interval();
      update_current_ind();
    } catch (ex) {
      console.error(`Error at parsing funscript: ${ex}`);
    };
  };
  reader.readAsText(file);
});

const update_func = async () => {
  if (script == null || fun_player.paused) {
    return;
  };
  const at = fun_player.currentTime.toFixed(3) * 1000;
  // console.log(at);
  while (script.actions.length > current_ind + 1 &&
         script.actions[current_ind + 1].at <= at) {
    current_ind += 1;
  };
  if (current_ind === -1) {
    return;
  };
  await vibrate_all(script.actions[current_ind].pos / 100 *
    vibration_rate_input.value / 100);
};

(async () => {
  while (true) {
    await update_func();
    // TODO(c4): find min delay between two actions and use it as a
    // param here
    await new Promise(r => setTimeout(r, script_min_interval));
  };
})();

fun_player.addEventListener('play', update_current_ind);
fun_player.addEventListener('seeked', update_current_ind);

fun_player.addEventListener('pause', () => {
  vibrate_all_stop();
});

if (intiface_address_input.value === "") {
  intiface_address_input.value = "ws://localhost:12345";
};
