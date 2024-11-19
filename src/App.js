import React, { useState, useRef } from "react";
import "./index.css"; // Adjust to your actual CSS file

const WallPaintVisualizer = () => {
  const [image, setImage] = useState(null);
  const [selectedColor, setSelectedColor] = useState("#ff0000");
  const [sections, setSections] = useState({});
  const [currentSection, setCurrentSection] = useState(null);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [isBrushing, setIsBrushing] = useState(false);
  const [brushSize, setBrushSize] = useState(5);
  const [lastPosition, setLastPosition] = useState(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageURL = URL.createObjectURL(file);
      setImage(imageURL);
      const img = new Image();
      img.src = imageURL;
      img.onload = () => {
        const resizedImg = resizeImage(img, 800);
        drawImageOnCanvas(resizedImg);
      };
    }
  };

  const resizeImage = (img, maxWidth) => {
    const canvas = document.createElement("canvas");
    const aspectRatio = img.height / img.width;

    canvas.width = img.width > maxWidth ? maxWidth : img.width;
    canvas.height = img.width > maxWidth ? maxWidth * aspectRatio : img.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  };

  const drawImageOnCanvas = (resizedImg) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = resizedImg.width;
    canvas.height = resizedImg.height;
    ctx.drawImage(resizedImg, 0, 0);
  };

  // Function: Apply histogram equalization
  const histogramEqualization = (imageData) => {
    const { data, width, height } = imageData;
    const histogram = new Array(256).fill(0);
    const equalizedData = new Uint8ClampedArray(data.length);
    const totalPixels = width * height;
    
    // Step 1: Build histogram
    for (let i = 0; i < data.length; i += 4) {
      const brightness = Math.floor((data[i] + data[i + 1] + data[i + 2]) / 3);
      histogram[brightness]++;
    }

    // Step 2: Cumulative distribution function
    const cdf = new Array(256);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }

    // Step 3: Normalize the CDF
    for (let i = 0; i < cdf.length; i++) {
      cdf[i] = Math.floor((cdf[i] - cdf[0]) / (totalPixels - cdf[0]) * 255);
    }

    // Step 4: Map the original pixel values to equalized values
    for (let j = 0; j < data.length; j += 4) {
      const oldBrightness = Math.floor((data[j] + data[j + 1] + data[j + 2]) / 3);
      const newBrightness = cdf[oldBrightness];
      equalizedData[j] = newBrightness;
      equalizedData[j + 1] = newBrightness;
      equalizedData[j + 2] = newBrightness;
      equalizedData[j + 3] = data[j + 3]; // Preserve alpha
    }

    return new ImageData(equalizedData, width, height);
  };

  const detectEdges = (imageData) => {
    // Apply histogram equalization to improve contrast
    const equalizedImageData = histogramEqualization(imageData);
    const grayScale = toGrayscale(equalizedImageData.data, equalizedImageData.width, equalizedImageData.height);
    const blurred = applyGaussianBlur(grayScale, equalizedImageData.width, equalizedImageData.height);
    
    return getEdges(blurred, equalizedImageData.width, equalizedImageData.height);
  };

  const toGrayscale = (data, width, height) => {
    const grayScale = new Uint8ClampedArray(width * height);
    
    for (let i = 0; i < data.length; i += 4) {
      grayScale[i / 4] = 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2];
    }
    return grayScale;
  };

  const applyGaussianBlur = (data, width, height) => {
    const kernel = [
      [1 / 16, 2 / 16, 1 / 16],
      [2 / 16, 4 / 16, 2 / 16],
      [1 / 16, 2 / 16, 1 / 16],
    ];

    const blurred = new Float32Array(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            sum += data[idx] * kernel[ky + 1][kx + 1];
          }
        }
        blurred[y * width + x] = sum;
      }
    }
    return blurred;
  };

  const getEdges = (blurred, width, height) => {
    const edges = new Uint8ClampedArray(width * height);
    const adaptiveThreshold = calculateAdaptiveThreshold(blurred, width, height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gradientX = computeGradient(blurred, x, y, width, 'x');
        const gradientY = computeGradient(blurred, x, y, width, 'y');
        const magnitude = Math.sqrt(gradientX ** 2 + gradientY ** 2);
        edges[idx] = magnitude > adaptiveThreshold[y][x] ? 255 : 0;
      }
    }

    return edges;
  };

  const calculateAdaptiveThreshold = (data, width, height) => {
    const thresholds = Array.from({ length: height }, (_, y) => {
      return Array.from({ length: width }, (_, x) => {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += data[ny * width + nx];
              count++;
            }
          }
        }
        return (sum / count) * 0.8; // Adjust multiplier for sensitivity
      });
    });
    return thresholds;
  };

  const computeGradient = (data, x, y, width, direction) => {
    const sobelKernelX = [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1],
    ];

    const sobelKernelY = [
      [1, 2, 1],
      [0, 0, 0],
      [-1, -2, -1],
    ];

    const kernel = direction === 'x' ? sobelKernelX : sobelKernelY;
    let gradient = 0;

    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const idx = ((y + ky) * width + (x + kx));
        gradient += data[idx] * kernel[ky + 1][kx + 1];
      }
    }

    return gradient;
  };

  const segmentRegions = (edges, imageData) => {
    const { width, height } = imageData;
    const visited = new Uint8Array(width * height);
    const sections = {};
    let sectionId = 0;

    const floodFill = (startX, startY) => {
      const pixels = [];
      const stack = [[startX, startY]];

      while (stack.length) {
        const [cx, cy] = stack.pop();
        const idx = cy * width + cx;

        if (
          cx >= 0 && cy >= 0 && cx < width && cy < height &&
          !visited[idx] && edges[idx] === 0 && !isUnwantedObject(imageData.data, idx * 4)
        ) {
          visited[idx] = 1;
          pixels.push([cx, cy]);

          stack.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
        }
      }

      if (pixels.length > 0) {
        sections[sectionId++] = pixels;
      }
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && edges[idx] === 0 && !isUnwantedObject(imageData.data, idx * 4)) {
          floodFill(x, y);
        }
      }
    }

    return sections;
  };

  const isUnwantedObject = (data, index) => {
    const [r, g, b] = data.slice(index, index + 3);
    return (r > 200 && g > 200 && b > 200) || (r > 150 && g < 100 && b < 100);
    return;
  };

  const detectWallSections = () => {
    if (!image) {
      alert("Please upload an image first!");
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const edges = detectEdges(imageData);
    const detectedSections = segmentRegions(edges, imageData);

    setSections(detectedSections);
    drawSections(detectedSections);
  };

  const drawSections = (detectedSections) => {
    const overlay = overlayRef.current;
    const ctx = overlay.getContext("2d");
    overlay.width = canvasRef.current.width;
    overlay.height = canvasRef.current.height;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const colorPalette = generateColorPalette();

    Object.entries(detectedSections).forEach(([id, pixels]) => {
      const color = colorPalette[id % colorPalette.length];
      ctx.fillStyle = color;
      pixels.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    });
  };

  const generateColorPalette = () => {
    return [
      "rgba(255, 0, 0, 0.5)",
      "rgba(0, 255, 0, 0.5)",
      "rgba(0, 0, 255, 0.5)",
      "rgba(255, 255, 0, 0.5)",
      "rgba(0, 255, 255, 0.5)",
      "rgba(255, 0, 255, 0.5)"
    ];
  };

  const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  };

  const handleMouseDown = (e) => {
    const canvas = overlayRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

    if (isBrushing) {
      setLastPosition({ x, y });
      paint(x, y);
    }
  };

  const handleMouseMove = (e) => {
    if (isBrushing && lastPosition) {
      const canvas = overlayRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
      paint(x, y);
      setLastPosition({ x, y });
    }
  };

  const handleMouseUp = () => {
    setLastPosition(null);
  };

  const paint = (x, y) => {
    const canvas = overlayRef.current;
    const ctx = canvas.getContext("2d");
    const newColor = hexToRgb(selectedColor);
    const alphaValue = 1;

    ctx.fillStyle = `rgba(${newColor.r}, ${newColor.g}, ${newColor.b}, ${alphaValue})`;
    ctx.beginPath();

    if (lastPosition) {
      ctx.moveTo(lastPosition.x, lastPosition.y);
    } else {
      ctx.moveTo(x, y);
    }

    ctx.lineTo(x, y);
    ctx.lineWidth = brushSize * 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    ctx.closePath();
  };

  const applyColorToSection = () => {
    if (currentSection === null) {
      alert("Please select a section first!");
      return;
    }

    const canvas = overlayRef.current;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const newColor = hexToRgb(selectedColor);
    const sectionPixels = sections[currentSection];

    sectionPixels.forEach(([x, y]) => {
      const index = (y * canvas.width + x) * 4;
      data[index] = newColor.r;
      data[index + 1] = newColor.g;
      data[index + 2] = newColor.b;
      data[index + 3] = 255; // Full opacity for sections to see them clearly
    });

    ctx.putImageData(imageData, 0, 0);
  };

  const handleSectionClick = (x, y) => {
    let clickedSection = null;
    for (const [sectionId, pixels] of Object.entries(sections)) {
      if (pixels.some(([px, py]) => px === x && py === y)) {
        clickedSection = sectionId;
        break;
      }
    }

    if (clickedSection !== null) {
      setCurrentSection(clickedSection);
    }
  };

  const handleMouseOver = (e) => {
    const canvas = overlayRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

    let hovered = null;
    for (const [sectionId, pixels] of Object.entries(sections)) {
      if (pixels.some(([px, py]) => px === x && py === y)) {
        hovered = sectionId;
        break;
      }
    }

    setHoveredSection(hovered);
  };

  const reset = () => {
    setSections({});
    setCurrentSection(null);
    setHoveredSection(null);
    if (image) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.src = image;
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
      };
    }
  };

  const downloadImage = () => {
    const baseCanvas = canvasRef.current;
    const overlayCanvas = overlayRef.current;

    const combinedCanvas = document.createElement("canvas");
    combinedCanvas.width = baseCanvas.width;
    combinedCanvas.height = baseCanvas.height;

    const ctx = combinedCanvas.getContext("2d");
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);

    const link = document.createElement("a");
    link.download = "updated_wall_image.png";
    link.href = combinedCanvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="container">
      <h1>Wall Paint Visualizer</h1>
      <div className="controls">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageUpload}
        />
        <button className="upload-button" onClick={() => fileInputRef.current.click()}>Scan Wall</button>
        <button className="detect-button" onClick={detectWallSections}>Detect Wall Sections</button>
        <button className="download-button" onClick={downloadImage}>Download Updated Image</button>
      </div>
      {image && (
        <div className="canvas-container">
          <canvas ref={canvasRef} className="canvas" />
          <canvas
            ref={overlayRef}
            className="overlay"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onClick={(e) => {
              const canvas = overlayRef.current;
              const rect = canvas.getBoundingClientRect();
              const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
              const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
              handleSectionClick(x, y);
            }}
            onMouseMove={handleMouseOver}
          />
        </div>
      )}
      <div className="color-controls">
        <h2>Select Color</h2>
        <div className="color-palette">
          {[
            "#FFFFFF", "#F2F3F4", "#D5DBDB", "#C8E6C9", "#B2DFDB", "#B39DDB", "#BBDEFB", "#FFAB91", 
            "#F8BBD0", "#FFE57F", "#FFE4B5", "#FFD700", "#FF6347", "#4682B4", "#7FFF00", "#8A2BE2", 
            "#6A5ACD", "#FF69B4", "#A9A9A9", "#696969", "#808080", "#708090", "#2F4F4F", "#000000", 
            "#36454F", "#2C3539", "#353839", "#343434", "#F5F5F5", "#D8D8D8", "#C4E1FF", "#0D98BA", 
            "#A2DFF7", "#B7E4D7", "#9EEDDA", "#8FBC8F", "#FF6F61", "#F0E68C", "#9370DB", "#FFB6C1", 
            "#BDB76B", "#DDA0DD", "#F08080", "#32CD32", "#00FA9A", "#FAFAD2", "#FFEBCD", "#FDF5E6", 
            "#FFFAF0", "#FFF5EE", "#D3D3D3", "#B0C4DE", "#87CEEB", "#ADD8E6", "#E6E6FA", "#FFFACD", 
            "#FFE4E1"
          ].map((color) => (
            <div
              key={color}
              className="color-swatch"
              style={{ backgroundColor: color }}
              onClick={() => setSelectedColor(color)}
            />
          ))}
        </div>
        <div className="action-buttons">
          <button onClick={applyColorToSection} className="action-button">Apply Color to Section</button>
          <button onClick={reset} className="action-button">Reset</button>
        </div>
        <div>
          <strong>Hovered Section: </strong>
          {hoveredSection ? `Section ${hoveredSection}` : 'None'}
        </div>
        <label>
          Brush Size:
          <input 
            type="range" 
            min="1" 
            max="50" 
            value={brushSize} 
            onChange={(e) => setBrushSize(parseInt(e.target.value))} 
          />
        </label>
        <label>
          <input 
            type="checkbox" 
            checked={isBrushing} 
            onChange={(e) => setIsBrushing(e.target.checked)} 
          /> Use Brush
        </label>
      </div>
    </div>
  );
};

export default WallPaintVisualizer;