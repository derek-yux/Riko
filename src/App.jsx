// src/App.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Upload, RotateCcw, Move, Eye, Loader2, ZoomIn, RotateCw, Sparkles, Search, MapPin, DollarSign, X, Lightbulb, Terminal, ChevronRight } from 'lucide-react';
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
  const [addingToRoom, setAddingToRoom] = useState(null);
  
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
    const spriteWidth = spriteHeight *aspectRatio;
    
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

      // Get text response
      const text = data.candidates[0].content.parts[0].text;

      // 1. Find the outer JSON array brackets
      const start = text.indexOf('[');
      let end = text.lastIndexOf(']');

      let cleanText;
      if (start === -1) {
        throw new Error("No JSON array found in response");
      }

      if (end === -1 || end <= start) {
        // Response was truncated — no closing ']' found
        // Try to recover by closing any open objects and the array
        cleanText = text.substring(start);
        // Remove the last incomplete object (after the last complete '},')
        const lastCompleteObj = cleanText.lastIndexOf('},');
        if (lastCompleteObj !== -1) {
          cleanText = cleanText.substring(0, lastCompleteObj + 1) + ']';
        } else {
          throw new Error("Response was truncated and could not be recovered. Try analyzing with fewer images.");
        }
      } else {
        cleanText = text.substring(start, end + 1);
      }

      // Remove trailing commas (e.g., "[A, B, ]" -> "[A, B]")
      cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');

      try {
        const detectedItems = JSON.parse(cleanText);
        setItems(detectedItems);
        setView('ar');
      } catch (parseError) {
        // Second recovery attempt: try closing unclosed braces/brackets
        try {
          let recovered = cleanText;
          const lastBrace = recovered.lastIndexOf('}');
          if (lastBrace !== -1) {
            recovered = recovered.substring(0, lastBrace + 1);
            // Ensure array is closed
            if (!recovered.trimEnd().endsWith(']')) {
              recovered += ']';
            }
            recovered = recovered.replace(/,\s*([\]}])/g, '$1');
            const detectedItems = JSON.parse(recovered);
            console.warn(`Recovered ${detectedItems.length} items from truncated response`);
            setItems(detectedItems);
            setView('ar');
          } else {
            throw parseError;
          }
        } catch (recoveryError) {
          console.error("JSON Parse Error. Raw text:", cleanText);
          throw new Error(`Failed to parse 3D data: ${parseError.message}`);
        }
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
        headers: {
          'Content-Type': 'application/json',
        },
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
            maxOutputTokens: 8192
          }
        })
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }
      
      const text = data.candidates[0].content.parts[0].text.trim();
      const cleanText = text.replace(/```json|```/g, '').trim();
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Search the web for ${furnitureType} ${locationText} ${priceText}.
              Find 5 real products that are currently for sale on major retailers (Amazon, Wayfair, IKEA, Target, Home Depot, Walmart, etc.).
              For each product, provide:
              1. The exact product name as listed on the retailer's website
              2. The actual listed price
              3. The retailer/store name (must be a real retailer)
              4. Key features
              Return ONLY a JSON array in this exact format:
              [{"name":"Exact Product Name","price":"$XXX","store":"Store Name","features":"Key features description"}]`
            }]
          }],
          tools: [{
            google_search: {}
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'API Error');
      }

      const candidate = data.candidates[0];

      const text = candidate.content.parts
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

        // Map known retailers to their search URL patterns
        const storeSearchUrls = {
          'amazon': (q) => `https://www.amazon.com/s?k=${q}`,
          'wayfair': (q) => `https://www.wayfair.com/keyword.php?keyword=${q}`,
          'ikea': (q) => `https://www.ikea.com/us/en/search/?q=${q}`,
          'target': (q) => `https://www.target.com/s?searchTerm=${q}`,
          'walmart': (q) => `https://www.walmart.com/search?q=${q}`,
          'home depot': (q) => `https://www.homedepot.com/s/${q}`,
          'lowes': (q) => `https://www.lowes.com/search?searchTerm=${q}`,
          'lowe\'s': (q) => `https://www.lowes.com/search?searchTerm=${q}`,
          'overstock': (q) => `https://www.overstock.com/search?keywords=${q}`,
          'west elm': (q) => `https://www.westelm.com/search/?words=${q}`,
          'pottery barn': (q) => `https://www.potterybarn.com/search/?words=${q}`,
          'crate & barrel': (q) => `https://www.crateandbarrel.com/search?query=${q}`,
          'crate and barrel': (q) => `https://www.crateandbarrel.com/search?query=${q}`,
          'cb2': (q) => `https://www.cb2.com/search?query=${q}`,
          'costco': (q) => `https://www.costco.com/CatalogSearch?keyword=${q}`,
        };

        for (const rec of recommendations) {
          const storeLower = (rec.store || '').toLowerCase();
          const productQuery = encodeURIComponent(rec.name);

          // Try to match to a known retailer's search page
          const storeKey = Object.keys(storeSearchUrls).find(key => storeLower.includes(key));
          if (storeKey) {
            rec.url = storeSearchUrls[storeKey](productQuery);
          } else {
            // Fallback: Google search scoped to the store's site
            const siteQuery = encodeURIComponent(`${rec.name} site:${rec.store.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`);
            rec.url = `https://www.google.com/search?q=${siteQuery}`;
          }
        }

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

  const addFurnitureToRoom = async (furnitureItem, idx) => {
    setAddingToRoom(idx);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate a detailed 3D representation of this furniture item:
              Name: ${furnitureItem.name}
              Features: ${furnitureItem.features || ''}

              Return ONLY a single JSON object (not an array) with:
              - name: "${furnitureItem.name}"
              - x: 5
              - z: 5
              - color: hex color code matching the furniture
              - components: array of geometric shapes that make up the object, where each component has:
                - geometry: { type: "box"|"cylinder"|"sphere"|"cone"|"plane", params: {dimensions} }
                - position: { x, y, z } relative to object center (y=0 is the floor)
                - rotation: { x, y, z } in radians (optional)
                - color: hex color (optional, overrides base color)
                - emissive: hex color for glowing parts (optional)
                - emissiveIntensity: 0-1 (optional)

              Use realistic proportions and multiple components to capture the shape. For example a chair should have a seat, backrest, and 4 legs as separate components. Use real-world dimensions in meters.

              Example for a simple coffee table:
              {"name":"coffee table","x":5,"z":5,"color":"8B4513","components":[
                {"geometry":{"type":"box","params":{"width":1.2,"height":0.05,"depth":0.6}},"position":{"x":0,"y":0.45,"z":0}},
                {"geometry":{"type":"cylinder","params":{"radiusTop":0.04,"radiusBottom":0.04,"height":0.45}},"position":{"x":-0.5,"y":0.225,"z":-0.25}},
                {"geometry":{"type":"cylinder","params":{"radiusTop":0.04,"radiusBottom":0.04,"height":0.45}},"position":{"x":0.5,"y":0.225,"z":-0.25}},
                {"geometry":{"type":"cylinder","params":{"radiusTop":0.04,"radiusBottom":0.04,"height":0.45}},"position":{"x":-0.5,"y":0.225,"z":0.25}},
                {"geometry":{"type":"cylinder","params":{"radiusTop":0.04,"radiusBottom":0.04,"height":0.45}},"position":{"x":0.5,"y":0.225,"z":0.25}}
              ]}`
            }]
          }],
          generationConfig: {
            temperature: 0.4,
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

      const text = data.candidates[0].content.parts[0].text.trim();

      // Find the JSON object
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');

      if (start === -1 || end === -1) {
        throw new Error('No JSON object found in response');
      }

      let cleanText = text.substring(start, end + 1);
      cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');

      const newFurniture = JSON.parse(cleanText);
      // Ensure position is center of room
      newFurniture.x = 5;
      newFurniture.z = 5;
      newFurniture.name = furnitureItem.name;

      setItems(prevItems => [...prevItems, newFurniture]);
      setShowFurnitureModal(false);
      setView('ar');
    } catch (err) {
      console.error('Add to room error:', err);
      alert(`Failed to generate 3D model: ${err.message}`);
    } finally {
      setAddingToRoom(null);
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
        camera.position.y = Math.max(2, camera.position.y - deltaY * 0.05);
        camera.lookAt(0, 0, 0);
        
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
      const zoomSpeed = 0.1;
      const delta = e.deltaY > 0 ? 1 : -1;
      
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      
      camera.position.addScaledVector(direction, delta * zoomSpeed);
      camera.position.y = Math.max(2, Math.min(20, camera.position.y));
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
  }, [view, items]);

  const resetView = () => { setView('upload'); setImages([]); setItems([]); };

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
          <div className="flex gap-3">
            <button
              onClick={() => setShowLayoutModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              <Sparkles size={18} />
              AI Layout
            </button>
            <button
              onClick={() => setShowFurnitureModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Search size={18} />
              Find Furniture
            </button>
            <button
              onClick={resetView}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              <RotateCcw size={18} />
              New Room
            </button>
          </div>
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
                  <p className="text-lg font-semibold text-gray-700 mb-2">Click to upload up to 5 room images</p>
                  <p className="text-sm text-gray-500">PNG, JPG up to 10MB</p>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                </div>
              </label>

              {images.length > 0 && (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-lg shadow-lg bg-gray-50 border border-gray-200">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-2">
                      {images.map((img, idx) => (
                        <div key={idx} className="relative group aspect-square">
                          <img 
                            src={img} 
                            alt={`Room view ${idx + 1}`} 
                            className="w-full h-full object-cover rounded-lg" 
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={analyzeRoom}
                    disabled={loading || !apiKey}
                    className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg font-semibold text-lg hover:from-blue-600 hover:to-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={24} />
                        Processing {images.length} View{images.length > 1 ? 's' : ''}...
                      </>
                    ) : (
                      <>
                        <Eye size={24} />
                        Analyze & Create 3D Room
                      </>
                    )}
                  </button>
                  
                  {/* Clear Button */}
                  <button onClick={() => setImages([])} disabled={loading} className="w-full py-2 text-gray-500 hover:text-red-500 text-sm font-medium transition">
                    Clear Images
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'ar' && (
        <div className="flex-1 flex flex-col">
          <div className="bg-blue-500 text-white p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Move size={20} />
              <span className="font-semibold">Interactive 3D Room</span>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-blue-100">
              <div className="flex items-center gap-1"><Move size={16} /><span>Left-click & drag to move</span></div>
              <div className="flex items-center gap-1"><RotateCw size={16} /><span>Right-click & drag to rotate</span></div>
              <div className="flex items-center gap-1"><ZoomIn size={16} /><span>Scroll to zoom</span></div>
            </div>
            
            <p className="text-center mt-2 text-blue-100 font-medium h-6 transition-all duration-200">
              {selectedIdx !== null 
                ? `Selected: ${items[selectedIdx].name}` 
                : (hoveredItem ? `Hovering: ${hoveredItem}` : 'Select an object to edit')}
            </p>
          </div>
          
          <div className="flex-1 relative">
            <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          </div>
          <div className="bg-white p-4 border-t">
            <div className="flex flex-wrap gap-2 justify-center">
              {items.map((item, idx) => {
                const colorHex = item.color || 'AAAAAA';
                const textColor = getContrastColor(colorHex);
                const isSelected = selectedIdx === idx;
                
                return (
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

      {showLayoutModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="text-purple-600" size={28} />
                AI Layout Optimization
              </h2>
              <button
                onClick={() => setShowLayoutModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What kind of layout would you like?
                </label>
                <textarea
                  value={layoutPrompt}
                  onChange={(e) => setLayoutPrompt(e.target.value)}
                  placeholder="E.g., 'Make it more aesthetic and spacious', 'Arrange for better conversation flow', 'Maximize floor space', 'Create distinct zones for working and relaxing'"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={4}
                />
              </div>

              <div className="bg-purple-50 rounded-lg p-4">
                <h3 className="font-semibold text-purple-900 mb-2">Examples:</h3>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• More aesthetic and visually balanced</li>
                  <li>• Maximize usable floor space</li>
                  <li>• Functional grouping for work and relaxation</li>
                  <li>• Better conversation and social interaction</li>
                  <li>• Feng shui principles</li>
                </ul>
              </div>

              <button
                onClick={optimizeLayout}
                disabled={layoutLoading || !layoutPrompt.trim()}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-700 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-purple-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {layoutLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Optimizing Layout...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Optimize Layout
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Furniture Finder Modal */}
      {showFurnitureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-8 max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Search className="text-green-600" size={28} />
                Find Furniture
              </h2>
              <button
                onClick={() => {
                  setShowFurnitureModal(false);
                  setFurnitureResults([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  What furniture are you looking for?
                </label>
                <input
                  type="text"
                  value={furnitureType}
                  onChange={(e) => setFurnitureType(e.target.value)}
                  placeholder="E.g., 'modern coffee table', 'ergonomic office chair', 'velvet sofa'"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <DollarSign size={16} />
                    Price Range (Optional)
                  </label>
                  <input
                    type="text"
                    value={priceRange}
                    onChange={(e) => setPriceRange(e.target.value)}
                    placeholder="E.g., '$100-$300', 'under $500', 'budget-friendly'"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <MapPin size={16} />
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={userLocation}
                    onChange={(e) => setUserLocation(e.target.value)}
                    placeholder="E.g., 'New York', 'Los Angeles', 'Toronto'"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              <button
                onClick={findFurniture}
                disabled={furnitureLoading || !furnitureType.trim()}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {furnitureLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search size={20} />
                    Search Furniture
                  </>
                )}
              </button>
            </div>

            {furnitureResults.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-800">Recommendations</h3>
                {furnitureResults.map((item, idx) => (
                  <div key={idx} className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-semibold text-gray-900">{item.name}</h4>
                      <span className="text-green-700 font-bold">{item.price}</span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      <strong>Store:</strong> {item.store}
                    </p>
                    <p className="text-sm text-gray-700 mb-3">{item.features}</p>
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
                        onClick={() => addFurnitureToRoom(item, idx)}
                        disabled={addingToRoom === idx}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium transition ${addingToRoom === idx ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {addingToRoom === idx ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                        {addingToRoom === idx ? 'Generating 3D Model...' : 'Add to Room'}
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
  );
}