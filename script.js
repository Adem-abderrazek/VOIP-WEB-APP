// Your Agora app credentials
const APP_ID = '671e200479964d40a35872d673040e00';
const TOKEN = null; // Use token for production

// Get project ID from URL parameters to use as channel name
function getProjectIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId');
  return projectId ? `project-${projectId}` : 'testchannel';
}

// Set channel name based on project ID
const CHANNEL = getProjectIdFromUrl();

// Global variables
let client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
let localTracks = {
  audioTrack: null,
  videoTrack: null,
  screenTrack: null
};
let remoteUsers = {};
let isMuted = false;
let isVideoOff = false;
let isScreenSharing = false;

// UI elements
const micBtn = document.getElementById('mic-btn');
const cameraBtn = document.getElementById('camera-btn');
const screenBtn = document.getElementById('screen-btn');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const cameraSelect = document.getElementById('camera-select');
const micSelect = document.getElementById('mic-select');

// Initialize the application
async function initializeApp() {
  // Hide leave button initially
  leaveBtn.style.display = 'none';

  // Update the title with project ID
  updateConferenceTitle();

  // Populate device options
  await getDevices();

  // Add event listeners
  joinBtn.addEventListener('click', joinCall);
  leaveBtn.addEventListener('click', leaveCall);
  micBtn.addEventListener('click', toggleMic);
  cameraBtn.addEventListener('click', toggleCamera);
  screenBtn.addEventListener('click', toggleScreenShare);

  // Listen for device changes
  cameraSelect.addEventListener('change', switchCamera);
  micSelect.addEventListener('change', switchMicrophone);
}

// Create animated background circles
function createCircles() {
  const movingCircles = document.getElementById('movingCircles');
  if (!movingCircles) return;

  const circleCount = 5;
  const colors = [
    'var(--primary-color)',
    'var(--secondary-color)',
    'var(--accent-color)'
  ];

  for (let i = 0; i < circleCount; i++) {
    const circle = document.createElement('div');
    circle.classList.add('circle');

    // Random position, size, and animation
    const size = Math.random() * 200 + 100;
    circle.style.width = `${size}px`;
    circle.style.height = `${size}px`;
    circle.style.left = `${Math.random() * 100}%`;
    circle.style.top = `${Math.random() * 100}%`;
    circle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    circle.style.animationDelay = `${Math.random() * 5}s`;
    circle.style.animationDuration = `${Math.random() * 10 + 15}s`;

    movingCircles.appendChild(circle);
  }
}

// Update circle colors when theme changes
function updateCircleColors() {
  const circles = document.querySelectorAll('.circle');
  circles.forEach(circle => {
    const colors = [
      'var(--primary-color)',
      'var(--secondary-color)',
      'var(--accent-color)'
    ];
    circle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
  });
}

// Update the conference title with project information
function updateConferenceTitle() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('projectId');

  if (projectId) {
    const titleElement = document.getElementById('conference-title');
    if (titleElement) {
      titleElement.textContent = `Project ${projectId} - Video Call`;
    }
  }
}

// Get available devices
async function getDevices() {
  try {
    const devices = await AgoraRTC.getDevices();

    // Populate camera options
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    videoDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${cameraSelect.length + 1}`;
      cameraSelect.appendChild(option);
    });

    // Populate microphone options
    const audioDevices = devices.filter(device => device.kind === 'audioinput');
    audioDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Microphone ${micSelect.length + 1}`;
      micSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error getting devices:', error);
  }
}

// Join the call
async function joinCall() {
  try {
    // Set up event handlers
    client.on('user-published', handleUserPublished);
    client.on('user-left', handleUserLeft);

    // Join the channel
    const uid = await client.join(APP_ID, CHANNEL, TOKEN, null);
    console.log("Joined channel with UID:", uid);

    // Create and publish local tracks
    localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack({
      microphoneId: micSelect.value !== '' ? micSelect.value : undefined
    });

    localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack({
      cameraId: cameraSelect.value !== '' ? cameraSelect.value : undefined
    });

    // Play local video
    const localPlayer = document.getElementById('local-player');
    localPlayer.innerHTML = '';
    localTracks.videoTrack.play('local-player');

    // Publish local tracks to channel
    await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
    console.log("Published local tracks");

    // Update UI
    joinBtn.style.display = 'none';
    leaveBtn.style.display = 'flex';
  } catch (error) {
    console.error('Error joining call:', error);
    alert(`Failed to join call: ${error.message}`);
  }
}

// Leave the call
async function leaveCall() {
  try {
    // Close and release local tracks
    if (localTracks.audioTrack) {
      localTracks.audioTrack.close();
    }
    if (localTracks.videoTrack) {
      localTracks.videoTrack.close();
    }
    if (localTracks.screenTrack) {
      localTracks.screenTrack.close();
    }

    // Stop screen sharing if active
    if (isScreenSharing) {
      await stopScreenShare();
    }

    // Leave the channel
    await client.leave();

    // Clear the UI
    document.getElementById('local-player').innerHTML = '';
    document.getElementById('remote-playerlist').innerHTML = '';

    // Reset state
    remoteUsers = {};
    localTracks = {
      audioTrack: null,
      videoTrack: null,
      screenTrack: null
    };

    // Update UI
    joinBtn.style.display = 'flex';
    leaveBtn.style.display = 'none';
    micBtn.classList.remove('active');
    cameraBtn.classList.remove('active');
    screenBtn.classList.remove('active');
    isMuted = false;
    isVideoOff = false;
    isScreenSharing = false;

    console.log("Left the channel");
  } catch (error) {
    console.error('Error leaving call:', error);
  }
}

// Toggle microphone mute state
async function toggleMic() {
  if (!localTracks.audioTrack) return;

  try {
    if (isMuted) {
      // Unmute
      await localTracks.audioTrack.setEnabled(true);
      micBtn.classList.remove('active');
      micBtn.querySelector('i').className = 'fas fa-microphone';
    } else {
      // Mute
      await localTracks.audioTrack.setEnabled(false);
      micBtn.classList.add('active');
      micBtn.querySelector('i').className = 'fas fa-microphone-slash';
    }
    isMuted = !isMuted;
  } catch (error) {
    console.error('Error toggling microphone:', error);
  }
}

// Toggle camera on/off state
async function toggleCamera() {
  if (!localTracks.videoTrack) return;

  try {
    if (isVideoOff) {
      // Turn on camera
      await localTracks.videoTrack.setEnabled(true);
      cameraBtn.classList.remove('active');
      cameraBtn.querySelector('i').className = 'fas fa-video';
    } else {
      // Turn off camera
      await localTracks.videoTrack.setEnabled(false);
      cameraBtn.classList.add('active');
      cameraBtn.querySelector('i').className = 'fas fa-video-slash';
    }
    isVideoOff = !isVideoOff;
  } catch (error) {
    console.error('Error toggling camera:', error);
  }
}

// Toggle screen sharing
async function toggleScreenShare() {
  try {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  } catch (error) {
    console.error('Error toggling screen share:', error);
    if (error.name === 'NotAllowedError') {
      alert('You need to grant screen sharing permission');
    } else {
      alert(`Failed to ${isScreenSharing ? 'stop' : 'start'} screen sharing: ${error.message}`);
    }
  }
}

// Start screen sharing
async function startScreenShare() {
  try {
    // Create a screen track
    localTracks.screenTrack = await AgoraRTC.createScreenVideoTrack();

    // Store the camera track temporarily
    const cameraTrack = localTracks.videoTrack;

    // Unpublish the camera track
    if (cameraTrack) {
      await client.unpublish(cameraTrack);
    }

    // Publish the screen track
    await client.publish(localTracks.screenTrack);

    // Replace the local video display with screen sharing
    document.getElementById('local-player').innerHTML = '';
    localTracks.screenTrack.play('local-player');

    // Update UI
    screenBtn.classList.add('active');
    isScreenSharing = true;

    // Handle screen sharing stopped by the browser UI
    localTracks.screenTrack.on('track-ended', async () => {
      await stopScreenShare();
    });

    console.log("Screen sharing started");
  } catch (error) {
    console.error('Error starting screen share:', error);
    throw error;
  }
}

// Stop screen sharing
async function stopScreenShare() {
  try {
    // Unpublish and close screen track
    if (localTracks.screenTrack) {
      await client.unpublish(localTracks.screenTrack);
      localTracks.screenTrack.close();
      localTracks.screenTrack = null;
    }

    // Republish the camera track
    if (localTracks.videoTrack) {
      await client.publish(localTracks.videoTrack);
      document.getElementById('local-player').innerHTML = '';
      localTracks.videoTrack.play('local-player');
    }

    // Update UI
    screenBtn.classList.remove('active');
    isScreenSharing = false;

    console.log("Screen sharing stopped");
  } catch (error) {
    console.error('Error stopping screen share:', error);
    throw error;
  }
}

// Switch camera device
async function switchCamera() {
  if (!localTracks.videoTrack) return;

  const newCameraId = cameraSelect.value;
  if (!newCameraId) return;

  try {
    // Create a new video track with selected device
    const newVideoTrack = await AgoraRTC.createCameraVideoTrack({
      cameraId: newCameraId
    });

    // Replace the current video track
    if (localTracks.videoTrack) {
      await client.unpublish(localTracks.videoTrack);
      localTracks.videoTrack.close();
    }

    localTracks.videoTrack = newVideoTrack;

    // Publish the new track
    await client.publish(localTracks.videoTrack);

    // Update local video display
    document.getElementById('local-player').innerHTML = '';
    localTracks.videoTrack.play('local-player');

    console.log("Camera switched");
  } catch (error) {
    console.error('Error switching camera:', error);
  }
}

// Switch microphone device
async function switchMicrophone() {
  if (!localTracks.audioTrack) return;

  const newMicId = micSelect.value;
  if (!newMicId) return;

  try {
    // Create a new audio track with selected device
    const newAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
      microphoneId: newMicId
    });

    // Replace the current audio track
    if (localTracks.audioTrack) {
      await client.unpublish(localTracks.audioTrack);
      localTracks.audioTrack.close();
    }

    localTracks.audioTrack = newAudioTrack;

    // Publish the new track
    await client.publish(localTracks.audioTrack);

    // Apply mute state if needed
    if (isMuted) {
      await localTracks.audioTrack.setEnabled(false);
    }

    console.log("Microphone switched");
  } catch (error) {
    console.error('Error switching microphone:', error);
  }
}

// Handle when a remote user publishes a track
async function handleUserPublished(user, mediaType) {
  try {
    // Subscribe to the user's published track
    await client.subscribe(user, mediaType);
    console.log("Subscribed to user:", user.uid, "mediaType:", mediaType);

    // Store the user in our remoteUsers object
    remoteUsers[user.uid] = user;

    // Handle video track
    if (mediaType === 'video') {
      // Create a div for this user's video
      let playerDiv = document.getElementById(`player-${user.uid}`);
      if (!playerDiv) {
        playerDiv = document.createElement('div');
        playerDiv.id = `player-${user.uid}`;
        playerDiv.className = 'video-player';

        // Add user name label
        const nameLabel = document.createElement('div');
        nameLabel.className = 'user-name';
        nameLabel.textContent = `User ${user.uid}`;
        playerDiv.appendChild(nameLabel);

        document.getElementById('remote-playerlist').appendChild(playerDiv);
      }

      // Play the video track
      user.videoTrack.play(playerDiv.id);
    }

    // Handle audio track
    if (mediaType === 'audio') {
      user.audioTrack.play();
    }
  } catch (error) {
    console.error('Error handling user published:', error);
  }
}

// Handle when a remote user leaves
function handleUserLeft(user) {
  try {
    // Remove the user from our remoteUsers object
    delete remoteUsers[user.uid];

    // Remove the user's video player
    const playerDiv = document.getElementById(`player-${user.uid}`);
    if (playerDiv) {
      playerDiv.remove();
    }

    console.log("User left:", user.uid);
  } catch (error) {
    console.error('Error handling user left:', error);
  }
}

// Note: createCircles and updateCircleColors functions are now defined in index.html

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializeApp();
});

// Also initialize immediately in case the DOM is already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(function() {
    initializeApp();
  }, 1);
}