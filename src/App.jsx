import React, { useState, useRef, useEffect } from 'react';
import { Upload, RotateCcw, Move, Eye, Loader2 } from 'lucide-react';
import * as THREE from 'three';

export default function RoomRedesigner() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [view, setView] = useState('upload');
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(true);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const objectsRef = useRef([]);
  const selectedRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const isDraggingRef = useRef(false);
  const dragPlaneRef = useRef(null);

  const itemColors = {
    chair: 0x8B4513,
    table: 0xA0522D,
    bed: 0x4169E1,
    sofa: 0x708090,
    lamp: 0xFFD700,
    desk: 0xCD853F,
    shelf: 0x8B7355,
    cabinet: 0x654321,
    default: 0x888888
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeRoom = async () => {
    if (!image || !apiKey) {
      alert('Please enter your Gemini API key');
      return;
    }
    
    setLoading(true);
    try {
      const base64Data = image.split(',')[1];
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: base64Data
                }
              },
              {
                text: `Analyze this room image and identify all furniture and objects. Return ONLY a JSON array with no preamble or markdown formatting. Each item should have: name (type of furniture), x (0-10 horizontal position), z (0-10 depth position), width, depth. Example: [{"name":"chair","x":2,"z":3,"width":1,"depth":1}]`
              }
            ]
          }]
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }
      
      const text = data.candidates[0].content.parts[0].text.trim();
      const cleanText = text.replace(/```json|```/g, '').trim();
      const detectedItems = JSON.parse(cleanText);
      
      setItems(detectedItems);
      setView('ar');
    } catch (err) {
      console.error('Analysis error:', err);
      alert(`Failed to analyze room: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'ar' || !canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    const dragPlaneGeometry = new THREE.PlaneGeometry(100, 100);
    const dragPlaneMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const dragPlane = new THREE.Mesh(dragPlaneGeometry, dragPlaneMaterial);
    dragPlane.rotation.x = -Math.PI / 2;
    scene.add(dragPlane);
    dragPlaneRef.current = dragPlane;

    objectsRef.current = [];
    items.forEach((item, idx) => {
      const width = item.width || 1;
      const depth = item.depth || 1;
      const height = item.height || 1.5;
      
      const geometry = new THREE.BoxGeometry(width, height, depth);
      const color = itemColors[item.name.toLowerCase()] || itemColors.default;
      const material = new THREE.MeshStandardMaterial({ color });
      const mesh = new THREE.Mesh(geometry, material);
      
      mesh.position.set(item.x - 5, height / 2, item.z - 5);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { name: item.name, id: idx };
      
      scene.add(mesh);
      objectsRef.current.push(mesh);
    });

    const handleMouseDown = (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(objectsRef.current);

      if (intersects.length > 0) {
        selectedRef.current = intersects[0].object;
        isDraggingRef.current = true;
        selectedRef.current.material.emissive.setHex(0x555555);
      }
    };

    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !selectedRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObject(dragPlaneRef.current);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        selectedRef.current.position.x = point.x;
        selectedRef.current.position.z = point.z;
      }
    };

    const handleMouseUp = () => {
      if (selectedRef.current) {
        selectedRef.current.material.emissive.setHex(0x000000);
        selectedRef.current = null;
      }
      isDraggingRef.current = false;
    };

    canvasRef.current.addEventListener('mousedown', handleMouseDown);
    canvasRef.current.addEventListener('mousemove', handleMouseMove);
    canvasRef.current.addEventListener('mouseup', handleMouseUp);

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('mousedown', handleMouseDown);
        canvasRef.current.removeEventListener('mousemove', handleMouseMove);
        canvasRef.current.removeEventListener('mouseup', handleMouseUp);
      }
      renderer.dispose();
    };
  }, [view, items]);

  const resetView = () => {
    setImage(null);
    setItems([]);
    setView('upload');
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      <div className="bg-white shadow-md p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <Eye className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">AI Room Redesigner</h1>
        </div>
        {view === 'ar' && (
          <button
            onClick={resetView}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            <RotateCcw size={18} />
            New Room
          </button>
        )}
      </div>

      {view === 'upload' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-3">Upload Your Room</h2>
              <p className="text-gray-600">
                Upload a photo of your room and AI will identify all furniture to create an interactive 3D model
              </p>
            </div>

            <div className="space-y-6">
              {showApiInput && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Gemini API key"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Get your API key from{' '}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Google AI Studio
                    </a>
                  </p>
                </div>
              )}

              <label className="block">
                <div className="border-3 border-dashed border-blue-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition">
                  <Upload className="mx-auto mb-4 text-blue-500" size={48} />
                  <p className="text-lg font-semibold text-gray-700 mb-2">
                    Click to upload room image
                  </p>
                  <p className="text-sm text-gray-500">PNG, JPG up to 10MB</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </label>

              {image && (
                <div className="space-y-4">
                  <img
                    src={image}
                    alt="Room preview"
                    className="w-full rounded-lg shadow-lg"
                  />
                  <button
                    onClick={analyzeRoom}
                    disabled={loading || !apiKey}
                    className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold text-lg hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={24} />
                        Analyzing Room...
                      </>
                    ) : (
                      <>
                        <Eye size={24} />
                        Analyze & Create 3D Room
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'ar' && (
        <div className="flex-1 flex flex-col">
          <div className="bg-blue-500 text-white p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Move size={20} />
              <span className="font-semibold">Interactive 3D Room</span>
            </div>
            <p className="text-sm text-blue-100">
              Click and drag furniture to rearrange your room • {items.length} items detected
            </p>
          </div>
          
          <div className="flex-1 relative">
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-grab active:cursor-grabbing"
            />
          </div>

          <div className="bg-white p-4 border-t">
            <div className="flex flex-wrap gap-2 justify-center">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="px-4 py-2 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `#${(itemColors[item.name.toLowerCase()] || itemColors.default).toString(16).padStart(6, '0')}22`,
                    color: `#${(itemColors[item.name.toLowerCase()] || itemColors.default).toString(16).padStart(6, '0')}`
                  }}
                >
                  {item.name}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}