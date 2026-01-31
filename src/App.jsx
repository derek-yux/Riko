import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, RotateCcw, Move, Eye, Loader2, ZoomIn, RotateCw, 
  Sparkles, Search, MapPin, DollarSign, X, Terminal, Moon, Sun, Wand2, Armchair, Box, User
} from 'lucide-react';
import * as THREE from 'three';

const SYSTEM_LOGS = [
  "Initializing neural network...",
  "Parsing image geometry...",
  "Detecting light sources...",
  "Calibrating scale reference...",
  "Identifying furniture entities...",
  "Generating voxel map...",
  "Triangulating mesh surfaces...",
  "Applying texture mapping...",
  "Optimizing shadow rendering...",
  "Finalizing 3D scene composition...",
  "Rendering finished."
];

export default function RoomRedesigner() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [items, setItems] = useState([]);
  const [view, setView] = useState('upload');
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(true);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [showFurnitureModal, setShowFurnitureModal] = useState(false);
  const [layoutPrompt, setLayoutPrompt] = useState('');
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [furnitureType, setFurnitureType] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [userLocation, setUserLocation] = useState('');
  const [furnitureLoading, setFurnitureLoading] = useState(false);
  const [furnitureResults, setFurnitureResults] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(true); // Changed to true for default dark mode
  const [isFirstPerson, setIsFirstPerson] = useState(false);
  
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const objectsRef = useRef([]);
  const labelsRef = useRef([]);
  const selectedRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const isDraggingRef = useRef(false);
  const isRotatingRef = useRef(false);
  const dragPlaneRef = useRef(null);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    let interval;
    if (loading) {
      setLogs([]);
      let step = 0;
      interval = setInterval(() => {
        if (step < SYSTEM_LOGS.length) {
          setLogs(prev => [...prev, SYSTEM_LOGS[step]]);
          step++;
        }
      }, 800);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const getContrastColor = (hex) => {
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
  };

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const remainingSlots = 5 - images.length;
    const filesToProcess = files.slice(0, remainingSlots);

    if (filesToProcess.length === 0) {
      if (images.length >= 5) alert("Maximum 5 images allowed");
      return;
    }

    Promise.all(filesToProcess.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.readAsDataURL(file);
      });
    })).then(newImages => {
      setImages(prev => [...prev, ...newImages]);
    });
  };

  const highlightObject = (object, highlight) => {
    if (!object) return;
    object.traverse(child => {
      if (child.material && child.material.emissive) {
        child.material.emissive = highlight ? new THREE.Color(0x555555) : new THREE.Color(0x000000);
      }
    });
  };

  const handleStaticLabelClick = (index) => {
    const object = objectsRef.current[index];
    if (object) {
      if (selectedRef.current && selectedRef.current !== object) {
        highlightObject(selectedRef.current, false);
      }
      
      selectedRef.current = object;
      highlightObject(object, true);
      setSelectedIdx(index);
    }
  };

  const createGeometry = (geometryData) => {
    const { type, params } = geometryData;
    
    switch(type) {
      case 'box':
        return new THREE.BoxGeometry(
          params.width || 1,
          params.height || 1,
          params.depth || 1
        );
      case 'cylinder':
        return new THREE.CylinderGeometry(
          params.radiusTop || 0.5,
          params.radiusBottom || 0.5,
          params.height || 1,
          params.segments || 8
        );
      case 'sphere':
        return new THREE.SphereGeometry(
          params.radius || 0.5,
          params.widthSegments || 8,
          params.heightSegments || 8
        );
      case 'cone':
        return new THREE.ConeGeometry(
          params.radius || 0.5,
          params.height || 1,
          params.segments || 8
        );
      case 'plane':
        return new THREE.PlaneGeometry(
          params.width || 1,
          params.height || 1
        );
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  };

  const createObjectFromComponents = (components, baseColor) => {
    const group = new THREE.Group();
    
    components.forEach(comp => {
      const geometry = createGeometry(comp.geometry);
      const color = comp.color ? parseInt(comp.color, 16) : baseColor;
      const material = new THREE.MeshStandardMaterial({ 
        color,
        emissive: comp.emissive ? parseInt(comp.emissive, 16) : 0x000000,
        emissiveIntensity: comp.emissiveIntensity || 0
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      if (comp.position) {
        mesh.position.set(
          comp.position.x || 0,
          comp.position.y || 0,
          comp.position.z || 0
        );
      }
      
      if (comp.rotation) {
        mesh.rotation.set(
          comp.rotation.x || 0,
          comp.rotation.y || 0,
          comp.rotation.z || 0
        );
      }
      
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    
    return group;
  };

  const createLabel = (text, color) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const fontSize = 32;
    const font = `bold ${fontSize}px Arial`;
    ctx.font = font;
    
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    
    const padding = 40;
    const canvasWidth = Math.max(256, textWidth + padding);
    const canvasHeight = 64;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    const aspectRatio = canvasWidth / canvasHeight;
    const spriteHeight = 0.5;
    const spriteWidth = spriteHeight * aspectRatio;
    
    sprite.scale.set(spriteWidth, spriteHeight, 1);
    return sprite;
  };

  const analyzeRoom = async () => {
    if (images.length === 0 || !apiKey) {
      alert('Please upload images and enter your Gemini API key');
      return;
    }
    
    setLoading(true);
    try {
      const imageParts = images.map(img => ({
        inline_data: {
          mime_type: img.substring(img.indexOf(':') + 1, img.indexOf(';')),
          data: img.split(',')[1]
        }
      }));
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              ...imageParts,
              { text: `Analyze these room images (different angles of the same room) and identify all room elements including:
                1. Architectural features: walls, doors, windows, floor boundaries
                2. Furniture: beds, sofas, tables, chairs, desks, cabinets, shelves
                3. Decorative items: lamps, plants, artwork, decorations
                
                For each object, provide detailed 3D representation data.

                Return ONLY a JSON array with no preamble or markdown. Each item must have:
                - name: descriptive name of the object (e.g., "north wall", "wooden chair", "ceiling lamp")
                - x: horizontal position (0-10)
                - z: depth position (0-10)
                - color: hex color code (e.g., "8B4513" for brown, "F5F5DC" for beige walls)
                - components: array of geometric shapes that make up the object, where each component has:
                  - geometry: { type: "box"|"cylinder"|"sphere"|"cone"|"plane", params: {dimensions} }
                  - position: { x, y, z } relative to object center
                  - rotation: { x, y, z } in radians (optional)
                  - color: hex color (optional, overrides base color)
                  - emissive: hex color for glowing parts (optional)
                  - emissiveIntensity: 0-1 (optional)

                Example for a wall:
                {"name": "north wall",
                "x": 5,
                "z": 0,
                "color": "F5F5DC",
                "components": [
                {"geometry": {"type": "box", "params": {"width": 10, "height": 3, "depth": 0.2}}, "position": {"x": 0, "y": 1.5, "z": 0}}
                ]}
                
                Example for a chair:
                {"name": "wooden chair",
                "x": 3,
                "z": 4,
                "color": "8B4513",
                "components": [
                {"geometry": {"type": "box", "params": {"width": 0.8, "height": 0.1, "depth": 0.8}}, "position": {"x": 0, "y": 0.5, "z": 0}},
                {"geometry": {"type": "cylinder", "params": {"radiusTop": 0.05, "radiusBottom": 0.05, "height": 0.5}}, "position": {"x": -0.3, "y": 0.25, "z": -0.3}},
                {"geometry": {"type": "cylinder", "params": {"radiusTop": 0.05, "radiusBottom": 0.05, "height": 0.5}}, "position": {"x": 0.3, "y": 0.25, "z": -0.3}},
                {"geometry": {"type": "cylinder", "params": {"radiusTop": 0.05, "radiusBottom": 0.05, "height": 0.5}}, "position": {"x": -0.3, "y": 0.25, "z": 0.3}},
                {"geometry": {"type": "cylinder", "params": {"radiusTop": 0.05, "radiusBottom": 0.05, "height": 0.5}}, "position": {"x": 0.3, "y": 0.25, "z": 0.3}},
                {"geometry": {"type": "box", "params": {"width": 0.8, "height": 0.6, "depth": 0.1}}, "position": {"x": 0, "y": 0.8, "z": -0.35}}
                ]}
                
                Be creative and detailed in representing each object's actual shape and features.`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 32,
            topP: 1,
            maxOutputTokens: 16384
          }
        })
      });

      const data = await response.json();
      
      if (data.error) {
        let errorMsg = data.error.message || 'API Error';
        if (errorMsg.includes('quota') || errorMsg.includes('Quota')) {
          errorMsg = 'Quota exceeded. Please enable billing in Google Cloud Console.';
        }
        throw new Error(errorMsg);
      }
      
      const text = data.candidates[0].content.parts[0].text;

      // More aggressive cleaning
      let cleanText = text.trim();

      // Remove markdown code blocks
      cleanText = cleanText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      // Find JSON array boundaries
      const start = cleanText.indexOf('[');
      const end = cleanText.lastIndexOf(']');

      if (start === -1 || end === -1) {
        throw new Error("No JSON array found in response");
      }

      cleanText = cleanText.substring(start, end + 1);

      // Remove trailing commas
      cleanText = cleanText.replace(/,(\s*[\]}])/g, '$1');

      // Remove comments (single and multi-line)
      cleanText = cleanText.replace(/\/\*[\s\S]*?\*\//g, '');
      cleanText = cleanText.replace(/\/\/.*/g, '');

      // Log for debugging
      console.log("Cleaned JSON:", cleanText);

      try {
        const detectedItems = JSON.parse(cleanText);
        setItems(detectedItems);
        setView('ar');
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError);
        console.error("Problematic JSON:", cleanText);
        
        // Try to identify the problem area
        const errorPos = parseError.message.match(/position (\d+)/);
        if (errorPos) {
          const pos = parseInt(errorPos[1]);
          const context = cleanText.substring(Math.max(0, pos - 100), Math.min(cleanText.length, pos + 100));
          console.error("Context around error:", context);
        }
        
        throw new Error(`Failed to parse 3D data. Check console for details.`);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      alert(`Failed to analyze room: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const optimizeLayout = async () => {
    if (!layoutPrompt.trim()) {
      alert('Please enter layout preferences');
      return;
    }

    setLayoutLoading(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Given this current room layout: ${JSON.stringify(items)}
              The room is a 10x10 grid where x and z coordinates range from 0-10.
              User's request: ${layoutPrompt}
              Provide an optimized layout that meets the user's requirements. Return ONLY a JSON array with the new arrangement. Keep ALL the same objects with their components and colors, just reposition them (change x and z coordinates).
              Return the complete array with all objects in the same format, just with updated x and z positions.`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096
          }
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }
      
      const text = data.candidates[0].content.parts[0].text.trim();
      console.log('Raw layout response:', text);

      let cleanText = text
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        cleanText = jsonMatch[0];
      }

      const newLayout = JSON.parse(cleanText);
      
      setItems(newLayout);
      setShowLayoutModal(false);
      setLayoutPrompt('');
      alert('Layout optimized! Check out the new arrangement.');
    } catch (err) {
      console.error('Layout optimization error:', err);
      alert(`Failed to optimize layout: ${err.message}`);
    } finally {
      setLayoutLoading(false);
    }
  };

  const findFurniture = async () => {
    if (!furnitureType.trim()) {
      alert('Please enter furniture type');
      return;
    }

    setFurnitureLoading(true);
    try {
      const locationText = userLocation.trim()
        ? `near ${userLocation}`
        : 'available online';

      const priceText = priceRange.trim()
        ? `in the ${priceRange} price range`
        : 'at various price points';

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Find and recommend ${furnitureType} ${locationText} ${priceText}.
              Provide 5 specific furniture recommendations with:
              1. Product name/description
              2. Estimated price
              3. Where to buy (store/website)
              4. Direct URL link to the product
              5. Key features
              Return ONLY a JSON array in this exact format:
              [{"name":"Product Name","price":"$XXX","store":"Store Name","url":"https://example.com/product","features":"Key features description"}]`
            }]
          }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }

      const text = data.candidates[0].content.parts
        .filter(part => part.text)
        .map(part => part.text)
        .join('\n')
        .trim();

      // 1. Find the outer JSON array brackets
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');

      if (start === -1 || end === -1) {
        console.error("No JSON array found in response. Raw Gemini output:", text);
        throw new Error("No JSON array found in response. Check console for raw output.");
      }

      // 2. Extract strictly the JSON part
      let cleanText = text.substring(start, end + 1);

      // 3. Remove trailing commas (e.g., "[A, B, ]" -> "[A, B]")
      cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');

      try {
        const recommendations = JSON.parse(cleanText);
        setFurnitureResults(recommendations);
      } catch (parseError) {
        console.error("JSON Parse Error. Raw Gemini output:", cleanText);
        throw new Error(`Failed to parse furniture data: ${parseError.message}. Check console for raw output.`);
      }
    } catch (err) {
      console.error('Furniture search error:', err);
      alert(`Failed to find furniture: ${err.message}`);
    } finally {
      setFurnitureLoading(false);
    }
  };

  const addFurnitureToRoom = async (furnitureItem) => {
    setFurnitureLoading(true);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a detailed 3D representation for: ${furnitureItem.name}

              Based on the product description: ${furnitureItem.features}

              Create a realistic 3D model using geometric components. Return ONLY a JSON object with no preamble or markdown in this exact format:
              {
                "name": "${furnitureItem.name}",
                "x": 5,
                "z": 5,
                "color": "hex color code that matches the furniture style",
                "components": [
                  {
                    "geometry": {"type": "box"|"cylinder"|"sphere"|"cone", "params": {dimensions}},
                    "position": {"x": 0, "y": 0, "z": 0},
                    "rotation": {"x": 0, "y": 0, "z": 0},
                    "color": "hex color (optional)"
                  }
                ]
              }

              Be creative and detailed to accurately represent the furniture's actual shape and features. For example:
              - A chair should have legs (cylinders), a seat (box), and a backrest
              - A table should have a top surface and legs
              - A lamp should have a base, pole, and shade
              - Use appropriate colors based on the product description`
            }]
          }],
          generationConfig: {
            temperature: 0.6,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }

      const text = data.candidates[0].content.parts[0].text;

      // Find the outer JSON object brackets
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');

      if (start === -1 || end === -1) {
        console.error("No JSON object found in response. Raw Gemini output:", text);
        throw new Error("No JSON object found in response. Check console for raw output.");
      }

      // Extract strictly the JSON part
      let cleanText = text.substring(start, end + 1);

      // Remove trailing commas
      cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');

      try {
        const newFurniture = JSON.parse(cleanText);

        // Add the new furniture to the items array
        setItems(prevItems => [...prevItems, newFurniture]);

        // Close the furniture modal and switch to AR view
        setShowFurnitureModal(false);
        setView('ar');

        alert(`${furnitureItem.name} added to your room! You can drag it to reposition.`);
      } catch (parseError) {
        console.error("JSON Parse Error. Raw Gemini output:", cleanText);
        throw new Error(`Failed to parse furniture 3D data: ${parseError.message}. Check console for raw output.`);
      }
    } catch (err) {
      console.error('Add furniture error:', err);
      alert(`Failed to add furniture: ${err.message}`);
    } finally {
      setFurnitureLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'ar' || !canvasRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDarkMode ? 0x0f172a : 0xf0f0f0);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 1000);
    
    // Initial Camera Position based on View Mode
    if (isFirstPerson) {
      camera.position.set(0, 1.6, 4);
      targetRef.current.set(0, 1.6, 0);
    } else {
      camera.position.set(0, 8, 12);
      targetRef.current.set(0, 0, 0);
    }
    
    camera.lookAt(targetRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      antialias: true,
      alpha: isDarkMode 
    });
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    if (isDarkMode) {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      const spotLight = new THREE.SpotLight(0xffffff, 1);
      spotLight.position.set(5, 15, 5);
      spotLight.angle = Math.PI / 4;
      spotLight.castShadow = true;
      scene.add(spotLight);
    } else {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);
    }

    const floorGeometry = new THREE.PlaneGeometry(20, 20);
    const floorMaterial = isDarkMode
      ? new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.5 })
      : new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
      
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const gridHelper = isDarkMode
      ? new THREE.GridHelper(20, 20, 0x38bdf8, 0x334155)
      : new THREE.GridHelper(20, 20, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    const dragPlane = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ visible: false }));
    dragPlane.rotation.x = -Math.PI / 2;
    scene.add(dragPlane);
    dragPlaneRef.current = dragPlane;

    objectsRef.current = [];
    labelsRef.current = [];
    
    items.forEach((item, idx) => {
      const baseColor = parseInt(item.color || 'AAAAAA', 16);
      const furniture = createObjectFromComponents(item.components || [], baseColor);
      furniture.position.set(item.x - 5, 0, item.z - 5);
      furniture.userData = { name: item.name, id: idx, originalColor: baseColor, isFurniture: true };
      
      const label = createLabel(item.name, baseColor);
      label.position.set(item.x - 5, 2, item.z - 5);
      label.visible = false; 
      label.userData = { id: idx, isLabel: true };
      labelsRef.current.push(label);
      scene.add(label);
      
      scene.add(furniture);
      objectsRef.current.push(furniture);
    });

    const handleMouseDown = (e) => {
      if (e.button === 2 || e.ctrlKey) {
        isRotatingRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      const allInteractables = [...objectsRef.current, ...labelsRef.current];
      const intersects = raycasterRef.current.intersectObjects(allInteractables, true);

      if (intersects.length > 0) {
        let hitObj = intersects[0].object;
        while (hitObj.parent && !hitObj.userData.name && !hitObj.userData.isLabel) {
          hitObj = hitObj.parent;
        }

        let targetFurniture = null;
        if (hitObj.userData.isLabel) {
          targetFurniture = objectsRef.current.find(obj => obj.userData.id === hitObj.userData.id);
        } else {
          targetFurniture = hitObj;
        }

        if (targetFurniture) {
          if (selectedRef.current && selectedRef.current !== targetFurniture) {
             highlightObject(selectedRef.current, false);
          }
          
          selectedRef.current = targetFurniture;
          isDraggingRef.current = true;
          highlightObject(targetFurniture, true);
          setSelectedIdx(targetFurniture.userData.id);
        }
      } else {
        if (selectedRef.current) {
          highlightObject(selectedRef.current, false);
          selectedRef.current = null;
          setSelectedIdx(null);
        }
      }
    };

    const handleMouseMove = (e) => {
      if (isRotatingRef.current) {
        const deltaX = e.clientX - lastMouseRef.current.x;
        const deltaY = e.clientY - lastMouseRef.current.y;
        
        const rotationSpeed = 0.005;
        const radius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
        const currentAngle = Math.atan2(camera.position.z, camera.position.x);
        const newAngle = currentAngle - deltaX * rotationSpeed;
        
        camera.position.x = radius * Math.cos(newAngle);
        camera.position.z = radius * Math.sin(newAngle);

        if (!isFirstPerson) {
           camera.position.y = Math.max(2, camera.position.y - deltaY * 0.05);
        } else {
           camera.position.y = 1.6;
        }
        
        camera.lookAt(targetRef.current);
        
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      if (isDraggingRef.current && selectedRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const intersects = raycasterRef.current.intersectObject(dragPlaneRef.current);

        if (intersects.length > 0) {
          const point = intersects[0].point;
          selectedRef.current.position.x = point.x;
          selectedRef.current.position.z = point.z;
          
          const idx = selectedRef.current.userData.id;
          if (labelsRef.current[idx]) {
            labelsRef.current[idx].position.x = point.x;
            labelsRef.current[idx].position.z = point.z;
          }
        }
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(objectsRef.current, true);

      labelsRef.current.forEach(label => label.visible = false);
      
      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.name) {
          obj = obj.parent;
        }
        const idx = obj.userData.id;
        if (labelsRef.current[idx]) {
          labelsRef.current[idx].visible = true;
          setHoveredItem(obj.userData.name);
        }
      } else {
        setHoveredItem(null);
      }
    };

    const handleMouseUp = () => {
        isDraggingRef.current = false;
        isRotatingRef.current = false;
    };

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomSpeed = isFirstPerson ? 0.05 : 0.1;
      const delta = e.deltaY > 0 ? 1 : -1;
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      camera.position.addScaledVector(direction, delta * zoomSpeed);
      
      if (isFirstPerson) {
        const maxRadius = 6;
        const radius = Math.sqrt(camera.position.x**2 + camera.position.z**2);
        if (radius > maxRadius) {
           const ratio = maxRadius / radius;
           camera.position.x *= ratio;
           camera.position.z *= ratio;
        }
        camera.position.y = 1.6;
      } else {
        camera.position.y = Math.max(2, Math.min(20, camera.position.y));
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    canvasRef.current.addEventListener('mousedown', handleMouseDown);
    canvasRef.current.addEventListener('mousemove', handleMouseMove);
    canvasRef.current.addEventListener('mouseup', handleMouseUp);
    canvasRef.current.addEventListener('wheel', handleWheel);
    canvasRef.current.addEventListener('contextmenu', handleContextMenu);

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
        canvasRef.current.removeEventListener('wheel', handleWheel);
        canvasRef.current.removeEventListener('contextmenu', handleContextMenu);
      }
      renderer.dispose();
    };
  }, [view, items, isDarkMode, isFirstPerson]);

  const resetView = () => { setView('upload'); setImages([]); setItems([]); };

  // Unified UI - Both modes now use the same structure
  const bgClass = isDarkMode 
    ? "w-full min-h-screen bg-slate-950 text-slate-100 font-sans relative overflow-hidden"
    : "w-full min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 text-gray-800 flex flex-col";

  return (
    <div className={bgClass}>
      {/* Background Ambience (Dark Mode Only) */}
      {isDarkMode && (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] animate-pulse pointer-events-none"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px] animate-pulse pointer-events-none delay-1000"></div>
        </>
      )}

      <div className={isDarkMode ? "relative z-10 flex flex-col h-screen" : "flex flex-col h-screen"}>
        {/* Header */}
        <header className={isDarkMode 
          ? "px-6 py-4 flex justify-between items-center backdrop-blur-md bg-slate-950/50 border-b border-white/10 sticky top-0 z-50"
          : "px-6 py-4 flex justify-between items-center bg-white shadow-md sticky top-0 z-50"
        }>
          <div className="flex items-center gap-3">
            <div className={isDarkMode 
              ? "p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20"
              : "w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center"
            }>
              <Sparkles className="text-white" size={24} />
            </div>
            <h1 className={isDarkMode 
              ? "text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400"
              : "text-2xl font-bold text-gray-800"
            }>
              Riko<span className="font-light">RoomRedesigner</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {view === 'ar' && (
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsFirstPerson(!isFirstPerson)}
                  className={isDarkMode
                    ? `flex items-center gap-2 px-4 py-2 rounded-full border transition-all backdrop-blur-sm ${isFirstPerson ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'}`
                    : `flex items-center gap-2 px-4 py-2 rounded-lg transition border ${isFirstPerson ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`
                  }
                >
                  {isFirstPerson ? <Box size={18} /> : <User size={18} />}
                  {isFirstPerson ? 'Orbit View' : 'Go Inside'}
                </button>
                <button 
                  onClick={() => setShowLayoutModal(true)} 
                  className={isDarkMode
                    ? "flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full border border-white/10 transition-all backdrop-blur-sm"
                    : "flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                  }
                >
                  <Wand2 size={18} className={isDarkMode ? "text-purple-400" : ""} /> AI Layout
                </button>
                <button 
                  onClick={() => setShowFurnitureModal(true)} 
                  className={isDarkMode
                    ? "flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-full border border-white/10 transition-all backdrop-blur-sm"
                    : "flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                  }
                >
                  <Search size={18} className={isDarkMode ? "text-emerald-400" : ""} /> Find Furniture
                </button>
                <button 
                  onClick={resetView} 
                  className={isDarkMode
                    ? "flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-200 rounded-full border border-red-500/20 transition-all"
                    : "flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                  }
                >
                  <RotateCcw size={18} /> Reset
                </button>
              </div>
            )}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className={isDarkMode
                ? "p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                : "p-2 rounded-lg hover:bg-gray-100 transition text-gray-600"
              }
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        {/* Upload View */}
        {view === 'upload' && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className={isDarkMode
              ? "bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-8 max-w-2xl w-full relative"
              : "bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full"
            }>
              <div className="text-center mb-8">
                <h2 className={isDarkMode ? "text-4xl font-bold text-white mb-4" : "text-3xl font-bold text-gray-800 mb-3"}>
                  Redesign Your Space
                </h2>
                <p className={isDarkMode ? "text-slate-400" : "text-gray-600"}>
                  Upload a photo and let AI transform it into an interactive 3D playground.
                </p>
              </div>

              <div className="space-y-6">
                {showApiInput && (
                  <div className={isDarkMode ? "bg-slate-950/50 p-4 rounded-xl border border-white/5" : ""}>
                    <label className={isDarkMode 
                      ? "block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2"
                      : "block text-sm font-medium text-gray-700 mb-2"
                    }>
                      {isDarkMode && <Terminal size={14} />} Gemini API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API key..."
                      className={isDarkMode
                        ? "w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 text-white placeholder-slate-600 outline-none"
                        : "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      }
                    />
                    {!isDarkMode && (
                      <p className="mt-2 text-xs text-gray-500">
                        Get your API key from{' '}
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Google AI Studio
                        </a>
                      </p>
                    )}
                  </div>
                )}

                <label className="block group cursor-pointer">
                  <div className={isDarkMode
                    ? "border-2 border-dashed border-slate-700 rounded-2xl p-12 text-center hover:border-purple-500 hover:bg-purple-500/5 transition-all"
                    : "border-3 border-dashed border-blue-300 rounded-xl p-12 text-center hover:border-blue-500 hover:bg-blue-50 transition"
                  }>
                    <div className={isDarkMode
                      ? "w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform"
                      : "mx-auto mb-4"
                    }>
                      <Upload className={isDarkMode ? "text-purple-400" : "text-blue-500"} size={isDarkMode ? 32 : 48} />
                    </div>
                    <p className={isDarkMode ? "text-xl font-semibold text-white mb-2" : "text-lg font-semibold text-gray-700 mb-2"}>
                      Drop room images here
                    </p>
                    <p className={isDarkMode ? "text-sm text-slate-500" : "text-sm text-gray-500"}>
                      Supports PNG, JPG (Max 5)
                    </p>
                    <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                  </div>
                </label>

                {images.length > 0 && (
                  <div className="space-y-4">
                    <div className={isDarkMode ? "grid grid-cols-5 gap-2" : "relative overflow-hidden rounded-lg shadow-lg bg-gray-50 border border-gray-200"}>
                      <div className={isDarkMode ? "contents" : "grid grid-cols-2 md:grid-cols-3 gap-2 p-2"}>
                        {images.map((img, idx) => (
                          <div key={idx} className={isDarkMode ? "" : "relative group aspect-square"}>
                            <img 
                              src={img} 
                              alt={`Room view ${idx + 1}`}
                              className={isDarkMode 
                                ? "w-full aspect-square object-cover rounded-lg border border-white/10"
                                : "w-full h-full object-cover rounded-lg"
                              } 
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={analyzeRoom}
                      disabled={loading || !apiKey}
                      className={isDarkMode
                        ? "w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-purple-500/25 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                        : "w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold text-lg hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                      }
                    >
                      {loading ? (
                        <>
                          <Loader2 className="animate-spin" size={24} />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Eye size={24} />
                          Generate 3D Room
                        </>
                      )}
                    </button>
                    <button 
                      onClick={() => setImages([])} 
                      disabled={loading} 
                      className={isDarkMode
                        ? "w-full py-2 text-slate-400 hover:text-red-400 text-sm font-medium transition"
                        : "w-full py-2 text-gray-500 hover:text-red-500 text-sm font-medium transition"
                      }
                    >
                      Clear Images
                    </button>
                  </div>
                )}
                
                {loading && (
                  <div className={isDarkMode
                    ? "bg-black/50 rounded-xl p-4 font-mono text-sm text-green-400 border border-green-900/30 h-32 overflow-y-auto"
                    : "bg-gray-900 rounded-xl p-4 font-mono text-sm text-green-400 border border-gray-700 h-32 overflow-y-auto"
                  }>
                    {logs.map((log, i) => <div key={i} className="mb-1 opacity-80">{log}</div>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AR View */}
        {view === 'ar' && (
          <div className="flex-1 flex flex-col relative">
            <div className={isDarkMode ? "flex-1 relative bg-slate-900" : "flex-1 relative"}>
              {/* Controls Overlay */}
              <div className={isDarkMode
                ? "absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-950/80 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 text-xs font-medium text-slate-300 flex gap-6 shadow-lg pointer-events-none"
                : "absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-md px-6 py-2 rounded-full border border-gray-200 text-xs font-medium text-gray-700 flex gap-6 shadow-lg pointer-events-none"
              }>
                <span className="flex items-center gap-2">
                  <Move size={14} className={isDarkMode ? "text-blue-400" : "text-blue-600"} /> Drag
                </span>
                <span className="flex items-center gap-2">
                  <RotateCw size={14} className={isDarkMode ? "text-purple-400" : "text-purple-600"} /> Rotate
                </span>
                <span className="flex items-center gap-2">
                  <ZoomIn size={14} className={isDarkMode ? "text-green-400" : "text-green-600"} /> Zoom
                </span>
              </div>
              
              {/* Status Message */}
              <div className={isDarkMode
                ? "absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-950/80 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 text-sm font-medium text-slate-300 shadow-lg pointer-events-none"
                : "absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-md px-6 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-700 shadow-lg pointer-events-none"
              }>
                {selectedIdx !== null 
                  ? `Selected: ${items[selectedIdx].name}` 
                  : (hoveredItem ? `Hovering: ${hoveredItem}` : 'Select an object to edit')}
              </div>
              
              <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
            </div>

            {/* Bottom Item List */}
            <div className={isDarkMode
              ? "bg-slate-950/80 backdrop-blur-xl border-t border-white/10 p-6 z-20"
              : "bg-white p-4 border-t shadow-lg z-20"
            }>
              <div className="max-w-6xl mx-auto flex flex-wrap gap-3 justify-center">
                {items.map((item, idx) => {
                  const colorHex = item.color || 'AAAAAA';
                  const textColor = isDarkMode ? '#FFFFFF' : getContrastColor(colorHex);
                  const isSelected = selectedIdx === idx;
                  
                  return isDarkMode ? (
                    <button 
                      key={idx}
                      onClick={() => handleStaticLabelClick(idx)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border flex items-center gap-2
                        ${isSelected ? 'bg-purple-500/20 border-purple-500 text-purple-200' : 'bg-slate-800/50 border-white/5 text-slate-300 hover:bg-slate-800'}`}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${colorHex}` }} />
                      {item.name}
                    </button>
                  ) : (
                    <div 
                      key={idx}
                      onClick={() => handleStaticLabelClick(idx)}
                      className={`px-4 py-2 rounded-full text-sm font-bold cursor-pointer transition-all duration-200 border-2 ${isSelected ? 'ring-2 ring-blue-500 scale-105 shadow-md' : 'border-transparent hover:scale-105'}`}
                      style={{ 
                        backgroundColor: `#${colorHex}`, 
                        color: textColor,
                        borderColor: isSelected ? '#3b82f6' : 'transparent',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    >
                      {item.name}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        {showLayoutModal && (
          <div className={isDarkMode
            ? "fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          }>
            <div className={isDarkMode
              ? "bg-slate-900 border border-white/10 rounded-3xl shadow-2xl max-w-2xl w-full p-8 relative"
              : "bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8"
            }>
              <div className="flex justify-between items-center mb-6">
                <h2 className={isDarkMode 
                  ? "text-2xl font-bold text-white flex items-center gap-3"
                  : "text-2xl font-bold text-gray-800 flex items-center gap-2"
                }>
                  <Wand2 className={isDarkMode ? "text-purple-400" : "text-purple-600"} size={28} />
                  AI Layout {isDarkMode ? "Studio" : "Optimization"}
                </h2>
                <button
                  onClick={() => setShowLayoutModal(false)}
                  className={isDarkMode ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-700"}
                >
                  <X size={24} />
                </button>
              </div>
              <textarea
                value={layoutPrompt}
                onChange={(e) => setLayoutPrompt(e.target.value)}
                placeholder="Describe your dream layout..."
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl focus:ring-2 focus:ring-purple-500 text-white h-32 mb-4"
                  : "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent h-32 mb-4"
                }
                rows={4}
              />
              {!isDarkMode && (
                <div className="bg-purple-50 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-purple-900 mb-2">Examples:</h3>
                  <ul className="text-sm text-purple-800 space-y-1">
                    <li>• More aesthetic and visually balanced</li>
                    <li>• Maximize usable floor space</li>
                    <li>• Functional grouping for work and relaxation</li>
                  </ul>
                </div>
              )}
              <button 
                onClick={optimizeLayout} 
                disabled={layoutLoading} 
                className={isDarkMode
                  ? "w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center"
                  : "w-full py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-purple-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                }
              >
                {layoutLoading ? <Loader2 className="animate-spin mx-auto" size={20} /> : <><Sparkles size={20} /> Optimize Layout</>}
              </button>
            </div>
          </div>
        )}

        {showFurnitureModal && (
          <div className={isDarkMode
            ? "fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          }>
            <div className={isDarkMode
              ? "bg-slate-900 border border-white/10 rounded-3xl shadow-2xl max-w-4xl w-full p-8 max-h-[85vh] overflow-y-auto"
              : "bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-8 max-h-screen overflow-y-auto"
            }>
              <div className="flex justify-between items-center mb-6">
                <h2 className={isDarkMode
                  ? "text-2xl font-bold text-white flex items-center gap-3"
                  : "text-2xl font-bold text-gray-800 flex items-center gap-2"
                }>
                  <Armchair className={isDarkMode ? "text-emerald-400" : "text-green-600"} size={28} />
                  Furniture {isDarkMode ? "Scout" : "Finder"}
                </h2>
                <button
                  onClick={() => {setShowFurnitureModal(false); setFurnitureResults([]);}}
                  className={isDarkMode ? "text-slate-400 hover:text-white" : "text-gray-500 hover:text-gray-700"}
                >
                  <X size={24} />
                </button>
              </div>
              <div className={isDarkMode ? "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" : "space-y-4 mb-6"}>
                <input 
                  value={furnitureType} 
                  onChange={e=>setFurnitureType(e.target.value)} 
                  placeholder={isDarkMode ? "Item Name" : "E.g., 'modern coffee table', 'ergonomic office chair'"} 
                  className={isDarkMode
                    ? "bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3 md:col-span-3"
                    : "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  }
                />
                {!isDarkMode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <DollarSign size={16} /> Price Range (Optional)
                      </label>
                      <input
                        value={priceRange}
                        onChange={e=>setPriceRange(e.target.value)}
                        placeholder="E.g., '$100-$300', 'under $500'"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <MapPin size={16} /> Location (Optional)
                      </label>
                      <input
                        value={userLocation}
                        onChange={e=>setUserLocation(e.target.value)}
                        placeholder="E.g., 'New York', 'Toronto'"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
                {isDarkMode && (
                  <>
                    <input value={priceRange} onChange={e=>setPriceRange(e.target.value)} placeholder="Budget" className="bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3"/>
                    <input value={userLocation} onChange={e=>setUserLocation(e.target.value)} placeholder="Location" className="bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-3"/>
                  </>
                )}
                <button 
                  onClick={findFurniture} 
                  disabled={furnitureLoading} 
                  className={isDarkMode
                    ? "bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 flex items-center justify-center"
                    : "w-full py-3 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 col-span-2"
                  }
                >
                  {furnitureLoading ? <Loader2 className="animate-spin mx-auto" size={20}/> : <><Search size={20}/> {isDarkMode ? 'Find' : 'Search Furniture'}</>}
                </button>
              </div>
              {furnitureResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {furnitureResults.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={isDarkMode
                        ? "bg-slate-800/50 border border-white/5 rounded-2xl p-5 hover:bg-slate-800 transition-all"
                        : "bg-green-50 rounded-lg p-4 border border-green-200"
                      }
                    >
                      <div className="flex justify-between mb-2">
                        <h4 className={isDarkMode ? "font-bold text-white" : "font-semibold text-gray-900"}>{item.name}</h4>
                        <span className={isDarkMode ? "text-emerald-400 font-bold" : "text-green-700 font-bold"}>{item.price}</span>
                      </div>
                      <p className={isDarkMode ? "text-sm text-slate-400 mb-2" : "text-sm text-gray-600 mb-2"}>
                        <strong>Store:</strong> {item.store}
                      </p>
                      <p className={isDarkMode ? "text-sm text-slate-300 border-t border-white/5 pt-2" : "text-sm text-gray-700 mb-3"}>{item.features}</p>
                      <div className="flex gap-2">
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
                        >
                          <Search size={16} />
                          View Product
                        </a>
                      )}
                      <button
                        onClick={() => addFurnitureToRoom(item)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                      >
                        <Eye size={16} />
                        Add to Room
                      </button>
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
