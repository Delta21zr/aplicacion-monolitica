package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

type Service struct {
	Name    string
	Port    string
	Dir     string
	Command []string
	Color   string
}

// ANSI Colors
const (
	ColorReset   = "\033[0m"
	ColorCyan    = "\033[36m"
	ColorGreen   = "\033[32m"
	ColorYellow  = "\033[33m"
	ColorMagenta = "\033[35m"
	ColorBlue    = "\033[34m"
	ColorRed     = "\033[91m"
	ColorBrCyan  = "\033[96m"
	ColorBrGreen = "\033[92m"
)

var runningCmds []*exec.Cmd
var mu sync.Mutex

func main() {
	includeFrontend := flag.Bool("frontend", true, "Incluir el frontend de React/Vite")
	flag.Parse()

	// Obtener directorio raíz del monolito
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Printf("Error obteniendo directorio actual: %v\n", err)
		return
	}

	services := []Service{
		{
			Name:    "USER-SVC",
			Port:    ":3002",
			Dir:     filepath.Join(cwd, "user-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorCyan,
		},
		{
			Name:    "CATALOG ",
			Port:    ":8081",
			Dir:     filepath.Join(cwd, "catalog-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorGreen,
		},
		{
			Name:    "INVENTRY",
			Port:    ":8082",
			Dir:     filepath.Join(cwd, "inventory-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorYellow,
		},
		{
			Name:    "CART-SVC",
			Port:    ":8083",
			Dir:     filepath.Join(cwd, "cart-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorMagenta,
		},
		{
			Name:    "ORDER-PM",
			Port:    ":8084",
			Dir:     filepath.Join(cwd, "order-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorBlue,
		},
		{
			Name:    "SHIPPING",
			Port:    ":8085",
			Dir:     filepath.Join(cwd, "shipping-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorRed,
		},
		{
			Name:    "INTERACT",
			Port:    ":8086",
			Dir:     filepath.Join(cwd, "interaction-service-go"),
			Command: []string{"go", "run", "main.go"},
			Color:   ColorBrCyan,
		},
	}

	if *includeFrontend {
		frontendCmd := []string{"npm", "run", "dev"}
		if runtime.GOOS == "windows" {
			frontendCmd = []string{"cmd", "/c", "npm", "run", "dev"}
		}
		services = append(services, Service{
			Name:    "FRONTEND",
			Port:    ":5173",
			Dir:     filepath.Join(cwd, "frontend"),
			Command: frontendCmd,
			Color:   ColorBrGreen,
		})
	}

	fmt.Println("=================================================================")
	fmt.Println(" 🚀 INICIANDO TODOS LOS MICROSERVICIOS Y FRONTEND (MONOLITO) 🚀 ")
	fmt.Println("=================================================================")
	fmt.Println(" Presiona Ctrl + C en cualquier momento para detenerlos a todos.")
	fmt.Println("-----------------------------------------------------------------")

	// Capturar señal de interrupción (Ctrl+C)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("\n🛑 Deteniendo todos los servicios...")
		cleanup()
		os.Exit(0)
	}()

	var wg sync.WaitGroup

	// Iniciar API Gateway unificado en :8080 (ideal para exponer todos los servicios con un solo túnel de Ngrok)
	go startAPIGateway()

	for _, svc := range services {
		wg.Add(1)
		go func(s Service) {
			defer wg.Done()
			startService(s)
		}(svc)
	}

	wg.Wait()
}

func startAPIGateway() {
	routes := map[string]string{
		"/api/auth":         "http://localhost:3002",
		"/api/users":        "http://localhost:3002",
		"/api/catalog":      "http://localhost:8081",
		"/api/inventory":    "http://localhost:8082",
		"/api/cart":         "http://localhost:8083",
		"/api/orders":       "http://localhost:8084",
		"/api/payments":     "http://localhost:8084",
		"/api/shipping":     "http://localhost:8085",
		"/api/interactions": "http://localhost:8086",
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Cabeceras CORS y soporte para Ngrok
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, ngrok-skip-browser-warning")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if r.URL.Path == "/" || r.URL.Path == "/health" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"OK","gateway":"Monolito API Gateway :8080","services":["/api/payments","/api/orders","/api/interactions"]}`))
			return
		}

		for prefix, target := range routes {
			if strings.HasPrefix(r.URL.Path, prefix) {
				targetURL, _ := url.Parse(target)
				proxy := httputil.NewSingleHostReverseProxy(targetURL)
				proxy.ServeHTTP(w, r)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"Ruta no encontrada en el API Gateway"}`))
	})

	fmt.Printf("%s[GATEWAY  :8080]%s API Gateway activo en http://localhost:8080 (Usa 'ngrok http 8080' para compartir Pagos y Notificaciones)\n", ColorBrGreen, ColorReset)
	_ = http.ListenAndServe(":8080", mux)
}

func startService(s Service) {
	cmd := exec.Command(s.Command[0], s.Command[1:]...)
	cmd.Dir = s.Dir

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Printf("[%s] Error stdout: %v\n", s.Name, err)
		return
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		fmt.Printf("[%s] Error stderr: %v\n", s.Name, err)
		return
	}

	if err := cmd.Start(); err != nil {
		fmt.Printf("[%s] Error iniciando comando: %v\n", s.Name, err)
		return
	}

	mu.Lock()
	runningCmds = append(runningCmds, cmd)
	mu.Unlock()

	prefix := fmt.Sprintf("%s[%s %s]%s ", s.Color, s.Name, s.Port, ColorReset)
	fmt.Printf("%s Servicio iniciado (PID %d)\n", prefix, cmd.Process.Pid)

	// Stream stdout & stderr
	go pipeOutput(stdout, prefix)
	go pipeOutput(stderr, prefix)

	cmd.Wait()
}

func pipeOutput(reader io.Reader, prefix string) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Println(prefix + line)
	}
}

func cleanup() {
	mu.Lock()
	defer mu.Unlock()

	for _, cmd := range runningCmds {
		if cmd != nil && cmd.Process != nil {
			pid := cmd.Process.Pid
			if runtime.GOOS == "windows" {
				// Matar árbol de procesos en Windows (taskkill /F /T /PID)
				killCmd := exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(pid))
				_ = killCmd.Run()
			} else {
				_ = cmd.Process.Kill()
			}
		}
	}
}
