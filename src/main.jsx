import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  CircleHelp,
  Flag,
  Headphones,
  Info,
  LockKeyhole,
  Mic,
  MessageCircle,
  MoreHorizontal,
  PhoneOff,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
  X,
  MapPin,
  Maximize2,
  Minimize2,
  SwitchCamera,
  UserRound,
} from 'lucide-react';
import './styles.css';

const interests = ['Tech talk', 'Music', 'Campus life', 'Gaming', 'Projects'];
const CUCEK_RADIUS_KM = 5;
const CUCEK_CENTER = { latitude: 9.4604, longitude: 76.4379 };
const OWNER_DISPLAY_NAME = 'rakheesubinukasim';
const MINIMUM_RESERVED_NAME_LENGTH = 'rakhee'.length;
const FALLBACK_ICE_SERVERS = [{ urls: 'stun:13.127.200.56:3478' }];

function isReservedDisplayName(name) {
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, '');
  return normalizedName.length >= MINIMUM_RESERVED_NAME_LENGTH && OWNER_DISPLAY_NAME.startsWith(normalizedName);
}

function getSkyState(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const progress = minutes / (24 * 60);
  const daylight = minutes >= 360 && minutes < 18 * 60;
  const arc = Math.sin(((minutes - 360) / (12 * 60)) * Math.PI);
  const horizontal = daylight
    ? ((minutes - 360) / (12 * 60)) * 100
    : minutes >= 18 * 60
      ? 92 - ((minutes - 18 * 60) / (12 * 60)) * 100
      : -8 + (minutes / (6 * 60)) * 100;
  return {
    daylight,
    label: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    style: {
      '--celestial-x': `${Math.max(-8, Math.min(92, horizontal))}%`,
      '--celestial-y': `${daylight ? 13 + (1 - Math.max(0, arc)) * 28 : 18 + (1 - Math.max(0, Math.sin(progress * Math.PI))) * 26}%`,
    },
  };
}

function distanceInKilometres(first, second) {
  const earthRadius = 6371;
  const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos((first.latitude * Math.PI) / 180) * Math.cos((second.latitude * Math.PI) / 180) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function App() {
  const [skyState, setSkyState] = useState(() => getSkyState());
  const [mode, setMode] = useState('video');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('cucek_display_name') || '');
  const [partnerName, setPartnerName] = useState('CUCEK student');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState('Tech talk');
  const [isMatching, setIsMatching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState('user');
  const [showSafety, setShowSafety] = useState(false);
  const [locationState, setLocationState] = useState('unknown');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [onlineCount, setOnlineCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const matchCardRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const locationRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const tokenRef = useRef(localStorage.getItem('cucek_token'));
  const iceServersRef = useRef(FALLBACK_ICE_SERVERS);
  const pendingCandidatesRef = useRef([]);
  const iceRestartedRef = useRef(false);
  const chatMessagesRef = useRef(null);
  const peerIdRef = useRef(null);
  const initiatorRef = useRef(false);
  const pendingSignalsRef = useRef([]);
  const remoteStreamRef = useRef(null);
  const signalQueueRef = useRef(Promise.resolve());

  useEffect(() => () => {
    socketRef.current?.disconnect();
    peerConnectionRef.current?.close();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    const updateSky = () => setSkyState(getSkyState());
    const timer = window.setInterval(updateSky, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => setIsFullscreen(document.fullscreenElement === matchCardRef.current);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    if (isConnected && localVideoRef.current && mediaStreamRef.current) {
      localVideoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [isConnected, mode, cameraOn]);

  useEffect(() => {
    chatMessagesRef.current?.scrollTo({ top: chatMessagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const requestLocation = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      const distance = distanceInKilometres(CUCEK_CENTER, userLocation);
      if (distance > CUCEK_RADIUS_KM) {
        reject(new Error(`You are outside the CUCEK ${CUCEK_RADIUS_KM} km matching area.`));
        return;
      }
      locationRef.current = userLocation;
      setLocationState('inside');
      resolve();
    }, (error) => {
      const messages = {
        1: 'Location access was denied. Allow location permission and try again.',
        2: 'Your location could not be determined. Check your device location and try again.',
        3: 'Location lookup timed out. Check your connection and try again.',
      };
      reject(new Error(messages[error.code] || 'Location access is needed to join the CUCEK matching area.'));
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });

  const requestMedia = async (requestedMode = mode, requestedFacingMode = facingMode) => {
    if (requestedMode === 'text') return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera and microphone access is unavailable. Use HTTPS or localhost.');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: requestedFacingMode }, audio: true });
    } catch (error) {
      const messages = { NotAllowedError: 'Camera and microphone access was denied. Allow both permissions and try again.', NotFoundError: 'No camera or microphone was found on this device.', NotReadableError: 'Your camera or microphone is already in use by another app.', SecurityError: 'Camera and microphone require HTTPS or localhost.' };
      throw new Error(messages[error.name] || 'Could not access your camera and microphone.');
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = stream;
    setCameraOn(stream.getVideoTracks().some((track) => track.enabled));
    setMicOn(stream.getAudioTracks().some((track) => track.enabled));
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
  };

  const toggleFullscreen = async () => {
    if (!matchCardRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await matchCardRef.current.requestFullscreen();
    } catch (error) {
      setPermissionMessage(`Fullscreen is unavailable in this browser (${error.name || 'unsupported'}).`);
    }
  };

  const loadIceServers = async () => {
    try {
      let token = await getAnonymousToken();
      let response = await fetch('/api/webrtc-config', { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        token = await getAnonymousToken(true);
        response = await fetch('/api/webrtc-config', { headers: { Authorization: `Bearer ${token}` } });
      }
      if (!response.ok) throw new Error(`ICE configuration returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) throw new Error('ICE configuration was empty');
      iceServersRef.current = data.iceServers;
    } catch (error) {
      iceServersRef.current = FALLBACK_ICE_SERVERS;
      setPermissionMessage('TURN setup is unavailable; trying the direct video connection.');
    }
  };

  const processSignal = async ({ peerId: senderId, signal }) => {
    const peerConnection = peerConnectionRef.current;
    if (peerIdRef.current && senderId !== peerIdRef.current) return;
    if (!peerConnection || !peerIdRef.current) {
      pendingSignalsRef.current.push({ peerId: senderId, signal });
      return;
    }
    if (peerConnection.connectionState === 'closed') return;
    try {
      if (signal.description) {
        if (signal.description.type === 'offer' && peerConnection.signalingState !== 'stable') return;
        if (signal.description.type === 'answer' && peerConnection.signalingState !== 'have-local-offer') return;
        await peerConnection.setRemoteDescription(signal.description);
        for (const candidate of pendingCandidatesRef.current) await peerConnection.addIceCandidate(candidate);
        pendingCandidatesRef.current = [];
        if (signal.description.type === 'offer') {
          await peerConnection.setLocalDescription(await peerConnection.createAnswer());
          socketRef.current.emit('signal', { peerId: senderId, signal: { description: peerConnection.localDescription } });
        }
      } else if (signal.candidate) {
        if (peerConnection.remoteDescription) await peerConnection.addIceCandidate(signal.candidate);
        else pendingCandidatesRef.current.push(signal.candidate);
      }
    } catch (error) {
      setPermissionMessage(`Video negotiation failed (${error.name || 'connection error'}). Please try matching again.`);
    }
  };

  const handleSignal = (payload) => {
    signalQueueRef.current = signalQueueRef.current
      .then(() => processSignal(payload))
      .catch(() => {});
  };

  const createPeerConnection = (peerId, initiator) => {
    const socket = socketRef.current;
    peerIdRef.current = peerId;
    initiatorRef.current = initiator;
    setRemoteVideoReady(false);
    const configuration = { iceServers: iceServersRef.current };
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;
    pendingCandidatesRef.current = [];
    peerConnection.onicegatheringstatechange = () => {
      console.log('ICE Gathering State:', peerConnection.iceGatheringState);
    };
    mediaStreamRef.current?.getTracks().forEach((track) => peerConnection.addTrack(track, mediaStreamRef.current));
    peerConnection.ontrack = (event) => {
      if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
      if (event.streams[0]) remoteStreamRef.current = event.streams[0];
      else if (!remoteStreamRef.current.getTracks().some((track) => track.id === event.track.id)) remoteStreamRef.current.addTrack(event.track);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
        remoteVideoRef.current.play().catch(() => {});
      }
      setRemoteVideoReady(true);
    };
    peerConnection.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('signal', { peerId, signal: { candidate } });
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        iceRestartedRef.current = false;
        setPermissionMessage('');
      }
      if (peerConnection.connectionState === 'failed' && !iceRestartedRef.current) {
        iceRestartedRef.current = true;
        setPermissionMessage('Direct video is blocked. Trying the configured TURN relay...');
        peerConnection.createOffer({ iceRestart: true }).then(async (offer) => {
          await peerConnection.setLocalDescription(offer);
          socket.emit('signal', { peerId, signal: { description: peerConnection.localDescription } });
        }).catch(() => {
          setIsConnected(false);
          setPermissionMessage('The TURN relay could not connect. Check the TURN server configuration, then try again.');
        });
      } else if (peerConnection.connectionState === 'failed') {
        setIsConnected(false);
        setPermissionMessage('The video connection failed. Check your network and try another connection.');
      }
      if (peerConnection.connectionState === 'disconnected') setPermissionMessage('Connection interrupted. Waiting for the network...');
    };
    for (const pendingSignal of pendingSignalsRef.current.splice(0)) handleSignal(pendingSignal);
    if (initiator) {
      peerConnection.createOffer().then(async (offer) => {
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { peerId, signal: { description: peerConnection.localDescription } });
      });
    }
  };

  const getAnonymousToken = async (forceRefresh = false) => {
    if (forceRefresh) {
      tokenRef.current = null;
      localStorage.removeItem('cucek_token');
    }
    if (tokenRef.current) return tokenRef.current;
    let response;
    try {
      response = await fetch('/api/auth/anonymous', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    } catch {
      throw new Error('The session service is unavailable. Start the API server with "npm run server" and try again.');
    }
    if (!response.ok) throw new Error('The session service rejected the request. Please try again.');
    const data = await response.json();
    tokenRef.current = data.token;
    localStorage.setItem('cucek_token', data.token);
    return data.token;
  };

  const applyMode = async (nextMode, notifyPeer = true) => {
    if (!isConnected || nextMode === mode) return;
    setMode(nextMode);
    if (notifyPeer) socketRef.current?.emit('mode-change', { mode: nextMode });
    if (nextMode === 'text') {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setRemoteVideoReady(false);
      return;
    }
    try {
      await loadIceServers();
      await requestMedia('video');
      if (!peerConnectionRef.current) {
        createPeerConnection(peerIdRef.current, initiatorRef.current);
        return;
      }
      const senderTracks = new Set(peerConnectionRef.current.getSenders().map((sender) => sender.track));
      mediaStreamRef.current?.getTracks().forEach((track) => {
        if (!senderTracks.has(track)) peerConnectionRef.current.addTrack(track, mediaStreamRef.current);
      });
      if (initiatorRef.current) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        socketRef.current.emit('signal', { peerId: peerIdRef.current, signal: { description: peerConnectionRef.current.localDescription } });
      }
    } catch (error) {
      setPermissionMessage(error.message);
    }
  };

  const connectToQueue = async (ownerNamePassword = '', retryAuth = true) => {
    const token = await getAnonymousToken();
    if (mode === 'video') await loadIceServers();
    const socket = io({ auth: { token } });
    socketRef.current = socket;
    socket.on('signal', handleSignal);
    socket.on('online-count', (count) => setOnlineCount(count));
    const joinQueue = () => socket.emit('join-queue', { interest: selectedInterest, mode, displayName, ownerNamePassword, location: locationRef.current });
    const connectionTimeout = window.setTimeout(() => {
      if (!socket.connected) {
        socket.disconnect();
        setIsMatching(false);
        setPermissionMessage('The matching service took too long to respond. Please try again.');
      }
    }, 10000);
    const clearConnectionTimeout = () => window.clearTimeout(connectionTimeout);
    socket.once('connect', () => {
      clearConnectionTimeout();
      joinQueue();
    });
    socket.on('connect_error', (error) => {
      clearConnectionTimeout();
      if (/invalid|expired/i.test(error.message || '')) {
        tokenRef.current = null;
        localStorage.removeItem('cucek_token');
        if (retryAuth) {
          setPermissionMessage('Refreshing your session and reconnecting...');
          socket.disconnect();
          connectToQueue(ownerNamePassword, false).catch((retryError) => {
            setIsMatching(false);
            setPermissionMessage(retryError.message);
          });
          return;
        }
      }
      socket.disconnect();
      setIsMatching(false);
      setPermissionMessage('The matching service could not connect. Check that the server is running, then try again.');
    });
    socket.on('match-found', async ({ peerId, initiator, mode: sessionMode, partnerName: matchedName }) => {
      clearConnectionTimeout();
      peerIdRef.current = peerId;
      initiatorRef.current = initiator;
      setIsMatching(false);
      setMode(sessionMode);
      setPartnerName(matchedName || 'CUCEK student');
      setIsConnected(true);
      setMessages([]);
      if (sessionMode === 'video') {
        try {
          await requestMedia('video');
          createPeerConnection(peerId, initiator);
        } catch (error) {
          setPermissionMessage(error.message);
        }
      }
    });
    socket.once('queue-joined', clearConnectionTimeout);
    socket.on('mode-change', ({ mode: nextMode }) => applyMode(nextMode, false));
    socket.on('chat-message', ({ message, sentAt }) => {
      setMessages((current) => [...current, { message, sentAt, own: false }]);
    });
    socket.on('match-error', ({ message }) => {
      setIsMatching(false);
      setPermissionMessage(message);
    });
    socket.on('peer-left', () => {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      peerIdRef.current = null;
      initiatorRef.current = false;
      remoteStreamRef.current = null;
      pendingSignalsRef.current = [];
      setIsConnected(false);
      setMessages([]);
      setPermissionMessage('Your partner left the call. You can find another connection.');
    });
  };

  const stopCall = () => {
    socketRef.current?.emit('leave-call');
    socketRef.current?.disconnect();
    socketRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    peerIdRef.current = null;
    initiatorRef.current = false;
    remoteStreamRef.current = null;
    pendingSignalsRef.current = [];
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsMatching(false);
    setIsConnected(false);
    setMessages([]);
    setDraftMessage('');
    setRemoteVideoReady(false);
  };

  const startMatching = async (nameOverride = displayName, ownerNamePassword = '') => {
    const ownerName = isReservedDisplayName(nameOverride);
    const ownerAccess = ownerName && ownerNamePassword.trim().length > 0;
    if (!nameOverride.trim() || (ownerName && !ownerNamePassword)) {
      setShowNamePrompt(true);
      return;
    }
    setDisplayName(nameOverride.trim());
    localStorage.setItem('cucek_display_name', nameOverride.trim());
    setPermissionMessage('');
    setIsMatching(true);
    setIsConnected(false);
    try {
      if (ownerAccess) {
        locationRef.current = CUCEK_CENTER;
        setLocationState('owner');
        setPermissionMessage('Owner access verified. Location boundary bypassed.');
      } else {
        setPermissionMessage('Checking your CUCEK location...');
        await requestLocation();
      }
      setPermissionMessage(mode === 'video' ? 'Requesting camera and microphone access...' : 'Preparing your private session...');
      await requestMedia();
    } catch (error) {
      setIsMatching(false);
      setLocationState(error.message.includes('outside') ? 'outside' : 'denied');
      setPermissionMessage(error.message);
      return;
    }
    try {
      setPermissionMessage('Connecting to live matching...');
      await connectToQueue(ownerNamePassword);
    } catch (error) {
      setIsMatching(false);
      setPermissionMessage(error.message);
    }
  };

  const nextPerson = () => {
    stopCall();
    startMatching();
  };

  const cancelMatching = () => {
    stopCall();
    setPermissionMessage('Matching cancelled. Choose a mode and start again when ready.');
  };

  const sendMessage = (event) => {
    event.preventDefault();
    const message = draftMessage.trim();
    if (!message || !socketRef.current || !isConnected) return;
    socketRef.current.emit('chat-message', { message });
    setMessages((current) => [...current, { message, sentAt: new Date().toISOString(), own: true }]);
    setDraftMessage('');
  };

  const confirmName = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get('displayName').toString().trim();
    const password = formData.get('ownerNamePassword')?.toString() || '';
    if (name.length < 1 || name.length > 32) return;
    setShowNamePrompt(false);
    if (editingName) {
      setDisplayName(name);
      localStorage.setItem('cucek_display_name', name);
      setEditingName(false);
      setPermissionMessage('Username updated. It will be shown on your next connection.');
      return;
    }
    startMatching(name, password);
  };

  const openNameEditor = () => {
    setEditingName(true);
    setShowNamePrompt(true);
  };

  const toggleMic = () => {
    const nextValue = !micOn;
    mediaStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = nextValue; });
    setMicOn(nextValue);
  };

  const toggleCamera = () => {
    const nextValue = !cameraOn;
    mediaStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextValue; });
    setCameraOn(nextValue);
  };

  const switchCamera = async () => {
    if (!mediaStreamRef.current || !peerConnectionRef.current) return;
    const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
    let replacementStream;
    try {
      const currentTrack = mediaStreamRef.current.getVideoTracks()[0];
      const currentDeviceId = currentTrack?.getSettings?.().deviceId;
      const cameraRequest = { video: { facingMode: { ideal: nextFacingMode } }, audio: false };

      try {
        replacementStream = await navigator.mediaDevices.getUserMedia(cameraRequest);
        const replacementTrack = replacementStream.getVideoTracks()[0];
        const replacementDeviceId = replacementTrack?.getSettings?.().deviceId;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAnotherCamera = devices.filter((device) => device.kind === 'videoinput').length > 1;
        if (hasAnotherCamera && currentDeviceId && replacementDeviceId === currentDeviceId) {
          replacementStream.getTracks().forEach((track) => track.stop());
          replacementStream = null;
          const alternateCamera = devices.find((device) => device.kind === 'videoinput' && device.deviceId !== currentDeviceId);
          if (alternateCamera) {
            replacementStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: alternateCamera.deviceId } },
              audio: false,
            });
          }
        }
      } catch (error) {
        if (!['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(error.name)) throw error;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const alternateCameras = devices.filter((device) => device.kind === 'videoinput' && device.deviceId !== currentDeviceId);
        for (const device of alternateCameras) {
          try {
            replacementStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: device.deviceId } },
              audio: false,
            });
            break;
          } catch (deviceError) {
            if (!['OverconstrainedError', 'NotFoundError', 'NotReadableError'].includes(deviceError.name)) throw deviceError;
          }
        }
        if (!replacementStream) throw error;
      }

      const replacementTrack = replacementStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find((item) => item.track?.kind === 'video');
      if (!replacementTrack || !sender) throw new Error('No active camera track is available.');
      await sender.replaceTrack(replacementTrack);
      replacementTrack.enabled = cameraOn;
      const audioTracks = mediaStreamRef.current.getAudioTracks();
      const previousVideoTracks = mediaStreamRef.current.getVideoTracks();
      mediaStreamRef.current = new MediaStream([...audioTracks, replacementTrack]);
      previousVideoTracks.forEach((track) => track.stop());
      replacementStream.getTracks().filter((track) => track !== replacementTrack).forEach((track) => track.stop());
      if (localVideoRef.current) localVideoRef.current.srcObject = mediaStreamRef.current;
      setFacingMode(nextFacingMode);
      setPermissionMessage('');
    } catch (error) {
      replacementStream?.getTracks().forEach((track) => track.stop());
      const message = error.name === 'OverconstrainedError' || error.name === 'NotFoundError'
        ? 'This device does not provide a front and back camera.'
        : error.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera permission to switch views.'
          : error.name === 'NotReadableError'
            ? 'The camera is unavailable. Close other apps using it and try again.'
          : error.message;
      setPermissionMessage(message || 'Could not switch the camera.');
    }
  };

  return (
    <main className="app-shell">
      <div className={`riverside-scene ${skyState.daylight ? 'daylight' : 'nighttime'}`} style={skyState.style} aria-label={`Riverside sky, ${skyState.label}`}>
        <div className="celestial-body"><span className="sun-core" /><span className="moon-core" /></div>
        <div className="coconut-tree">
          <div className="tree-trunk" />
          <div className="tree-crown">
            <i /><i /><i /><i /><i /><i />
          </div>
        </div>
        <div className="far-bank" />
        <div className="river">
          <span /><span /><span /><span /><span />
        </div>
        <div className="shoreline" />
        <div className="fireflies"><i /><i /><i /><i /><i /></div>
      </div>
      <nav className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Radio size={19} strokeWidth={2.4} /></div>
          <div>
            <strong>CUCEK <span>CONNECT</span></strong>
            <small>Student-only conversations</small>
          </div>
        </div>
        <div className="online-status"><span className="status-dot" /> {onlineCount || '...'} online</div>
        <div className="nav-status"><span className={`status-dot ${locationState}`} /> {locationState === 'owner' ? 'Owner access' : locationState === 'inside' ? 'Inside 5 km zone' : '5 km CUCEK zone'} <ChevronDown size={15} /></div>
        <button className="user-name-button" onClick={openNameEditor} aria-label={displayName ? `Change username, currently ${displayName}` : 'Set username'} title="Change username"><UserRound size={15} /><span>{displayName || 'Set username'}</span></button>
        <button className="icon-button" aria-label="Help" title="Help"><CircleHelp size={20} /></button>
      </nav>

      <section className="hero-grid">
        <aside className="intro-column">
          <div className="eyebrow"><span className="eyebrow-line" /> FOUNDER RAKHEESUBINU KASIM (IT) </div>
          <h1> Meet  someone<br /><em>from your campus.</em></h1>
          <p className="intro-copy">A calm corner for spontaneous conversations at Cochin University College of Engineering Kuttanad.</p>

          <div className="privacy-note">
            <LockKeyhole size={18} />
            <div><strong>No names. No profiles required.</strong><span>Your identity stays yours until you choose to share it. Location is checked before matching.</span></div>
          </div>

          <div className="trust-list">
            <div><ShieldCheck size={17} /><span>Only people inside the CUCEK area</span><Check size={16} /></div>
            <div><ShieldCheck size={17} /><span>One-tap skip and report</span><Check size={16} /></div>
            <div><ShieldCheck size={17} /><span>Live safety signals in every chat</span><Check size={16} /></div>
          </div>

          <button className="safety-link" onClick={() => setShowSafety(true)}><Info size={15} /> How safety works</button>
        </aside>

        <section ref={matchCardRef} className="match-card">
          <div className="card-topline"><span className="live-pill"><span /> LIVE MATCHING</span><span className="card-count">{isConnected ? '01' : '01'} / 01</span></div>
          <div className="mode-tabs" role="tablist">
            <button disabled={isMatching} className={mode === 'video' ? 'active' : ''} onClick={() => (isConnected ? applyMode('video') : setMode('video'))}><Video size={17} /> Video</button>
            <button disabled={isMatching} className={mode === 'text' ? 'active' : ''} onClick={() => (isConnected ? applyMode('text') : setMode('text'))}><Headphones size={17} /> Text first</button>
          </div>

          <div className={`video-stage ${isConnected ? 'connected' : ''} ${mode === 'text' ? 'text-stage' : ''}`}>
            <div className="stage-grid" />
            {mode === 'video' && <button className="fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen video' : 'Open fullscreen video'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen video'}>{isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
            {!isConnected && !isMatching && <div className="stage-idle"><div className="idle-orbit"><Sparkles size={25} /></div><strong>Ready when you are</strong><span>Find a fellow CUCEK student<br />who is up for a chat.</span></div>}
            {isMatching && <div className="stage-idle searching"><div className="search-ring"><Radio size={24} /></div><strong>Finding your next connection</strong><span>Looking for someone who chose<br />{selectedInterest.toLowerCase()}.</span></div>}
            {isConnected && mode === 'video' && <><div className="remote-video"><video className={remoteVideoReady ? 'has-video' : ''} ref={remoteVideoRef} onLoadedMetadata={() => { setRemoteVideoReady(true); remoteVideoRef.current?.play().catch(() => {}); }} autoPlay playsInline /><div className={`avatar-large ${remoteVideoReady ? 'hidden' : ''}`}>{partnerName.charAt(0).toUpperCase()}</div><span className="remote-label"><span className="tiny-dot" /> {partnerName}</span><button className="remote-more"><MoreHorizontal size={16} /></button></div><div className="self-video"><video ref={localVideoRef} autoPlay muted playsInline /><div className="self-avatar">You</div><span className="self-label">{displayName}</span></div><div className="connection-badge"><span /> Connected securely</div></>}
            {isConnected && mode === 'text' && <div className="chat-panel"><div className="chat-header"><span><MessageCircle size={16} /> Private text chat</span><span className="chat-online"><span className="tiny-dot" /> Connected</span></div><div className="chat-messages" ref={chatMessagesRef}>{messages.length === 0 && <div className="chat-empty">Say hello. Your conversation is anonymous.</div>}{messages.map((item, index) => <div className={`chat-bubble ${item.own ? 'own' : ''}`} key={`${item.sentAt}-${index}`}>{item.message}</div>)}</div><form className="chat-composer" onSubmit={sendMessage}><input aria-label="Message" value={draftMessage} onChange={(event) => setDraftMessage(event.target.value)} maxLength={1000} placeholder="Write a message..." /><button type="submit" aria-label="Send message" title="Send message"><Send size={17} /></button></form></div>}
          </div>

          {permissionMessage && <div className={`permission-message ${locationState}`}><MapPin size={16} /><span>{permissionMessage}</span></div>}
          <div className="match-actions">
            {isConnected ? <><button className="control-button danger" onClick={stopCall} aria-label="End conversation" title="End conversation"><PhoneOff size={18} /></button><button className="primary-button next" onClick={nextPerson}>Next person <ArrowRight size={18} /></button></> : isMatching ? <button className="primary-button cancel-matching" onClick={cancelMatching} aria-label="Cancel matching"><Radio size={18} /> Cancel matching</button> : <button type="button" className="primary-button start-matching" onClick={() => startMatching()} aria-label="Start matching"><ArrowRight size={19} /> Start matching</button>}
          </div>
          {isConnected && mode === 'video' && <div className="call-controls"><button className={`control-button ${!micOn ? 'off' : ''}`} onClick={toggleMic} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'} title={micOn ? 'Mute microphone' : 'Unmute microphone'}>{micOn ? <Mic size={17} /> : <Mic size={17} />}</button><button className={`control-button ${!cameraOn ? 'off' : ''}`} onClick={toggleCamera} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} title={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Camera size={17} /> : <VideoOff size={17} />}</button><button className="control-button" onClick={switchCamera} aria-label={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`} title={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}><SwitchCamera size={17} /></button><button className="control-button"><Volume2 size={17} /></button><button className="report-button"><Flag size={15} /> Report</button></div>}
          <p className="match-footnote"><ShieldCheck size={14} /> Moderated space · Be kind, be real, be respectful</p>
        </section>
      </section>

      <footer className="footer-bar"><span>CUCEK Connect <b>·</b> Built for the campus community</span><span className="footer-links"><button>Community guidelines</button><button>Privacy</button><button>Feedback</button></span></footer>
      {showNamePrompt && <div className="modal-backdrop"><form className="name-modal" onSubmit={confirmName}><div className="modal-icon"><MessageCircle size={23} /></div><h2>{editingName ? 'Change your username' : 'Choose your name'}</h2><p>{editingName ? 'Update the name shown on your profile label. This change applies to your next connection.' : 'This is the name the other student will see. You can use a nickname.'}</p><label htmlFor="display-name">Your name</label><input key={editingName ? 'edit-name' : 'new-name'} id="display-name" name="displayName" defaultValue={displayName} autoFocus maxLength={32} required placeholder="e.g. Anu" /><label htmlFor="owner-name-password">Owner password (for names starting with Rakhee)</label><input id="owner-name-password" name="ownerNamePassword" type="password" inputMode="numeric" maxLength={128} placeholder="Only needed for an owner name" /><button className="primary-button modal-button" type="submit">{editingName ? 'Save username' : 'Continue to matching'} {editingName ? <Check size={17} /> : <ArrowRight size={17} />}</button></form></div>}
      {showSafety && <div className="modal-backdrop" onClick={() => setShowSafety(false)}><div className="safety-modal" onClick={(event) => event.stopPropagation()}><button className="close-modal" onClick={() => setShowSafety(false)} aria-label="Close"><X size={18} /></button><div className="modal-icon"><ShieldCheck size={23} /></div><h2>Designed for a safer campus</h2><p>Every session stays anonymous by default. Automated safety signals watch for harmful content, while quick report and skip controls keep you in charge.</p><div className="modal-rule"><Check size={16} /> CUCEK location boundary</div><div className="modal-rule"><Check size={16} /> No recording by default</div><div className="modal-rule"><Check size={16} /> Fast human review path</div><button className="primary-button modal-button" onClick={() => setShowSafety(false)}>Got it</button></div></div>}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
